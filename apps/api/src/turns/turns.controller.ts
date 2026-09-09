import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import {
  ACCEPTED_AUDIO_MIMES,
  CreateTurnFormFieldsSchema,
  ErrorCodes,
  TURN_AUDIO_MAX_BYTES,
  type CreateTurnFormFields,
} from "@aura/contracts";
import { createReadStream, existsSync } from "node:fs";
import type { Response } from "express";
import type { TurnAudioUpload } from "../ai/orchestrator/ai-orchestrator.service";
import { CurrentUser, ZodValidationPipe, type AuthUser } from "../common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { SessionsService } from "../sessions/sessions.service";
import { TurnsService } from "./turns.service";

/**
 * Turns HTTP surface mounted at `/v1/sessions/:id/turns`.
 *
 * Content-Type: multipart/form-data (SP-3). File field name must be exactly `audio`.
 * Rate limit: named throttle `voiceTurn` (20/min). Default ThrottlerGuard keys by
 * **IP**, not userId — AGENTS.md §6 asks per-user; deferred (no Redis in MVP).
 */
@ApiTags("turns")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("sessions")
export class TurnsController {
  constructor(
    private readonly turns: TurnsService,
    private readonly sessions: SessionsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * POST /v1/sessions/:id/turns — protected → TurnResponse (sync orchestration).
   */
  @Post(":id/turns")
  @HttpCode(200)
  @Throttle({ voiceTurn: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: "Submit a push-to-talk voice turn (multipart)" })
  @ApiConsumes("multipart/form-data")
  @ApiParam({ name: "id", format: "uuid", description: "Session id" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["audio"],
      properties: {
        audio: { type: "string", format: "binary" },
        clientDurationMs: { type: "integer", maximum: 90_000 },
        clientLocale: { type: "string", example: "vi" },
        clientTurnId: { type: "string", format: "uuid" },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor("audio", {
      limits: { fileSize: TURN_AUDIO_MAX_BYTES },
    }),
  )
  async create(
    @CurrentUser() user: AuthUser,
    @Param("id") sessionId: string,
    @UploadedFile() audio: TurnAudioUpload | undefined,
    @Body(new ZodValidationPipe(CreateTurnFormFieldsSchema.partial()))
    body: Partial<CreateTurnFormFields>,
  ) {
    if (!audio) {
      throw new BadRequestException({
        code: ErrorCodes.AUDIO_MISSING,
        message: "Audio file is required",
      });
    }

    if (!audio.size || audio.size <= 0) {
      throw new BadRequestException({
        code: ErrorCodes.AUDIO_INVALID,
        message: "Audio file is empty or unreadable",
      });
    }

    // Multer limit should catch this; defensive mapping for AUDIO_TOO_LARGE.
    if (audio.size > TURN_AUDIO_MAX_BYTES) {
      throw new HttpException(
        {
          code: ErrorCodes.AUDIO_TOO_LARGE,
          message: "Audio exceeds 5 MiB limit",
        },
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    const mime = (audio.mimetype || "").toLowerCase();
    const name = (audio.originalname || "").toLowerCase();
    const accepted = (ACCEPTED_AUDIO_MIMES as readonly string[]).includes(mime);
    const octetOk =
      mime === "application/octet-stream" &&
      (name.endsWith(".m4a") ||
        name.endsWith(".wav") ||
        name.endsWith(".mp4") ||
        name.endsWith(".wave"));

    if (!accepted && !octetOk) {
      throw new HttpException(
        {
          code: ErrorCodes.AUDIO_UNSUPPORTED_MIME,
          message: `Unsupported audio MIME: ${mime || "unknown"}`,
        },
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }

    const fields = CreateTurnFormFieldsSchema.parse(body ?? {});
    return this.turns.createTurn(user.userId, sessionId, fields, {
      fieldname: audio.fieldname,
      originalname: audio.originalname,
      mimetype: audio.mimetype,
      size: audio.size,
      buffer: audio.buffer,
      path: audio.path,
    });
  }

  /**
   * GET /v1/sessions/:sessionId/turns/:turnId/audio
   * Streams assistant (or user) audio for an owned session.
   * audioUrl in TurnResponse points here (relative `/v1/...`).
   */
  @Get(":sessionId/turns/:turnId/audio")
  @ApiOperation({ summary: "Stream turn audio (JWT + session ownership)" })
  @ApiParam({ name: "sessionId", format: "uuid" })
  @ApiParam({ name: "turnId", format: "uuid" })
  async audio(
    @CurrentUser() user: AuthUser,
    @Param("sessionId") sessionId: string,
    @Param("turnId") turnId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    // Ownership gate — 404 SESSION_NOT_FOUND for other users.
    await this.sessions.findOwnedWithPersona(user.userId, sessionId);

    const turn = await this.prisma.turn.findFirst({
      where: { id: turnId, sessionId },
      select: { audioUri: true },
    });
    if (!turn?.audioUri || !existsSync(turn.audioUri)) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: "Audio not found",
      });
    }

    const lower = turn.audioUri.toLowerCase();
    let contentType = "application/octet-stream";
    if (lower.endsWith(".wav") || lower.endsWith(".wave")) {
      contentType = "audio/wav";
    } else if (lower.endsWith(".m4a") || lower.endsWith(".mp4")) {
      contentType = "audio/mp4";
    } else if (lower.endsWith(".mp3")) {
      contentType = "audio/mpeg";
    }
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=60");
    return new StreamableFile(createReadStream(turn.audioUri));
  }
}
