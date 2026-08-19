import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import {
  CreateSessionRequestSchema,
  EndSessionRequestSchema,
  SessionListQuerySchema,
  type CreateSessionRequest,
  type EndSessionRequest,
  type SessionListQuery,
} from "@aura/contracts";
import { CurrentUser, ZodValidationPipe, type AuthUser } from "../common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { SessionsService } from "./sessions.service";

/**
 * Sessions HTTP surface under `/v1/sessions`.
 * All routes protected — history is user-scoped (AGENTS.md §4 / §6).
 * Global prefix `v1` is applied in main.ts — routes here omit the version segment.
 *
 * Out of scope here: POST /sessions/:id/turns (later module).
 *
 * Rate limit: session create uses named throttle `sessionCreate` (10/min).
 * Default ThrottlerGuard tracks by **IP**, not userId — AGENTS.md §6 asks for
 * per-user keying; deferred until a custom getTracker (still no Redis in MVP).
 */
@ApiTags("sessions")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("sessions")
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  /** POST /v1/sessions — protected → create open session (201) */
  @Post()
  @HttpCode(201)
  @Throttle({ sessionCreate: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "Create an open practice session" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["personaSlug"],
      properties: {
        personaSlug: {
          type: "string",
          enum: ["tough-interviewer", "native-buddy"],
        },
        locale: { type: "string", example: "vi" },
      },
    },
  })
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateSessionRequestSchema))
    body: CreateSessionRequest,
  ) {
    return this.sessions.create(user.userId, body);
  }

  /** GET /v1/sessions — protected → cursor list for caller */
  @Get()
  @ApiOperation({ summary: "List caller's sessions (cursor pagination)" })
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(SessionListQuerySchema))
    query: SessionListQuery,
  ) {
    return this.sessions.list(user.userId, query);
  }

  /** GET /v1/sessions/:id — protected → one session (owner only) */
  @Get(":id")
  @ApiOperation({ summary: "Get a session by id (owner only)" })
  @ApiParam({ name: "id", format: "uuid" })
  async get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.sessions.get(user.userId, id);
  }

  /** POST /v1/sessions/:id/end — protected → end session (idempotent) */
  @Post(":id/end")
  @HttpCode(200)
  @ApiOperation({ summary: "End a session (idempotent if already ended)" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiBody({
    schema: {
      type: "object",
      additionalProperties: false,
      description: "Empty body; EndSessionRequestSchema is strict {}",
    },
    required: false,
  })
  async end(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    // Contract: body optional; coerce missing body → {}.
    @Body(new ZodValidationPipe(EndSessionRequestSchema.default({})))
    _body: EndSessionRequest,
  ) {
    return this.sessions.end(user.userId, id);
  }
}
