import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { HttpException, Inject } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  ErrorCodes,
  VOICE_AUDIO_MAX_FRAME_BYTES,
  VOICE_UTTERANCE_MAX_BYTES,
  VOICE_WS_NAMESPACE,
  VoiceAudioFrameEventSchema,
  VoiceTurnEndEventSchema,
  VoiceTurnStartEventSchema,
  VoiceWsEvents,
  type VoiceAssistantTextEvent,
  type VoiceAudioEncoding,
  type VoiceErrorEvent,
  type VoiceSttFinalEvent,
  type VoiceSttPartialEvent,
  type VoiceTtsChunkEvent,
  type VoiceTurnDoneEvent,
  type VoiceTtsMime,
} from "@aura/contracts";
import type { Server, Socket } from "socket.io";
import { AuthSecrets } from "../auth/auth-secrets";
import { AppLogger, type AuthUser } from "../common";
import { AiOrchestratorService } from "../ai/orchestrator/ai-orchestrator.service";
import { STREAMING_STT_PROVIDER } from "../ai/tokens";
import type { StreamingSttProvider } from "../ai/interfaces/streaming-stt-provider";
import { SessionsService } from "../sessions/sessions.service";
import {
  extractAccessTokenFromHandshake,
  getSocketUser,
  setSocketUser,
  verifyVoiceAccessToken,
} from "./voice-auth";

type InflightTurn = {
  clientTurnId: string;
  sessionId: string;
  encoding: VoiceAudioEncoding;
  clientLocale?: string;
  nextSeq: number;
  totalBytes: number;
  startedAtMs: number;
  sttSession: ReturnType<StreamingSttProvider["createSession"]>;
  audioChunks: Buffer[];
};

/**
 * Simple in-memory final-turn rate limiter (MVP).
 * AGENTS.md wants 20 voice turns/min **per user**; ThrottlerGuard is IP-keyed
 * on REST and does not apply to Socket.IO. This counter keys by userId for
 * WS finals only — document the IP gap until a shared getTracker exists.
 */
class VoiceFinalRateLimiter {
  private readonly windowMs = 60_000;
  private readonly limit = 20;
  private readonly hits = new Map<string, number[]>();

  tryConsume(userId: string): boolean {
    const now = Date.now();
    const prev = this.hits.get(userId) ?? [];
    const recent = prev.filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(userId, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(userId, recent);
    return true;
  }
}

/**
 * Socket.IO voice gateway — namespace `/v1/voice` (ADR-0005 / SP-4).
 * JWT on connect; shared orchestrator finalize on `turn.end`.
 * Never logs tokens, raw audio, or full transcripts.
 */
@WebSocketGateway({
  namespace: VOICE_WS_NAMESPACE,
  cors: {
    origin: true,
    credentials: true,
  },
})
export class VoiceGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new AppLogger(VoiceGateway.name);
  private readonly rateLimiter = new VoiceFinalRateLimiter();
  /** One in-flight uplink turn per socket. */
  private readonly inflight = new Map<string, InflightTurn>();

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly secrets: AuthSecrets,
    private readonly sessions: SessionsService,
    private readonly orchestrator: AiOrchestratorService,
    @Inject(STREAMING_STT_PROVIDER)
    private readonly streamingStt: StreamingSttProvider,
  ) {}

  afterInit(server: Server): void {
    // Namespace middleware: reject unauthenticated connects before handlers run.
    server.use((socket, next) => {
      void this.authenticateSocket(socket)
        .then((user) => {
          if (!user) {
            const err = new Error("Unauthorized");
            (err as Error & { data?: VoiceErrorEvent }).data = {
              code: ErrorCodes.UNAUTHORIZED,
              message: "Valid access JWT required",
            };
            socket.disconnect(true);
            next(err);
            return;
          }
          setSocketUser(socket, user);
          next();
        })
        .catch(() => {
          const err = new Error("Unauthorized");
          (err as Error & { data?: VoiceErrorEvent }).data = {
            code: ErrorCodes.UNAUTHORIZED,
            message: "Valid access JWT required",
          };
          socket.disconnect(true);
          next(err);
        });
    });
    this.logger.log(`VoiceGateway ready namespace=${VOICE_WS_NAMESPACE}`);
  }

  handleConnection(client: Socket): void {
    const user = getSocketUser(client);
    this.logger.log(
      `voice.connect socketId=${client.id} userId=${user?.userId ?? "?"}`,
    );
  }

  handleDisconnect(client: Socket): void {
    const turn = this.inflight.get(client.id);
    if (turn) {
      try {
        turn.sttSession.cancel();
      } catch {
        // ignore
      }
      this.inflight.delete(client.id);
    }
    this.logger.log(`voice.disconnect socketId=${client.id}`);
  }

  @SubscribeMessage(VoiceWsEvents.TurnStart)
  async onTurnStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const user = this.requireUser(client);
    if (!user) return;

    const parsed = VoiceTurnStartEventSchema.safeParse(body);
    if (!parsed.success) {
      this.emitError(client, {
        code: ErrorCodes.VALIDATION_ERROR,
        message: "Invalid turn.start payload",
        details: parsed.error.flatten(),
      });
      return;
    }
    const event = parsed.data;

    if (this.inflight.has(client.id)) {
      this.emitError(client, {
        code: ErrorCodes.WS_TURN_IN_PROGRESS,
        message: "A voice turn is already in progress on this socket",
        clientTurnId: event.clientTurnId,
      });
      return;
    }

    // Session ownership + open gate
    let session;
    try {
      session = await this.sessions.findOwnedWithPersona(
        user.userId,
        event.sessionId,
      );
    } catch (err) {
      this.emitHttpMappedError(client, err, event.clientTurnId);
      return;
    }
    if (session.status === "ended") {
      this.emitError(client, {
        code: ErrorCodes.SESSION_CLOSED,
        message: "Session is closed",
        clientTurnId: event.clientTurnId,
      });
      return;
    }

    // Idempotent: already finalized → re-emit turn.done, do not open uplink.
    const prior = await this.orchestrator.findPriorTurnResponse(
      event.sessionId,
      event.clientTurnId,
    );
    if (prior) {
      this.emitTurnDone(client, {
        ...prior,
        clientTurnId: event.clientTurnId,
      });
      this.logger.log(
        `voice.turn.start idempotent sessionId=${event.sessionId} clientTurnId=${event.clientTurnId}`,
      );
      return;
    }

    const sttSession = this.streamingStt.createSession({
      locale: event.clientLocale ?? session.locale,
      encoding: event.encoding,
      sampleRateHz: event.sampleRateHz,
      channels: event.channels,
      onPartial: (partial) => {
        const payload: VoiceSttPartialEvent = {
          clientTurnId: event.clientTurnId,
          text: partial.text,
          isFinal: false,
        };
        client.emit(VoiceWsEvents.SttPartial, payload);
      },
    });

    this.inflight.set(client.id, {
      clientTurnId: event.clientTurnId,
      sessionId: event.sessionId,
      encoding: event.encoding,
      clientLocale: event.clientLocale,
      nextSeq: 0,
      totalBytes: 0,
      startedAtMs: Date.now(),
      sttSession,
      audioChunks: [],
    });

    this.logger.log(
      `voice.turn.start socketId=${client.id} sessionId=${event.sessionId} encoding=${event.encoding}`,
    );
  }

  @SubscribeMessage(VoiceWsEvents.AudioFrame)
  async onAudioFrame(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const user = this.requireUser(client);
    if (!user) return;

    // Socket.IO binary: client may emit (meta, buffer) → Nest receives as array.
    let meta: unknown = body;
    let attachment: Buffer | undefined;
    if (Array.isArray(body)) {
      meta = body[0];
      attachment = coerceBuffer(body[1]);
    }

    const parsed = VoiceAudioFrameEventSchema.safeParse(meta);
    if (!parsed.success) {
      this.emitError(client, {
        code: ErrorCodes.WS_AUDIO_INVALID,
        message: "Invalid audio.frame payload",
        details: parsed.error.flatten(),
      });
      return;
    }
    const frame = parsed.data;

    const turn = this.inflight.get(client.id);
    if (!turn || turn.clientTurnId !== frame.clientTurnId) {
      this.emitError(client, {
        code: ErrorCodes.WS_TURN_NOT_FOUND,
        message: "No matching in-progress turn for audio.frame",
        clientTurnId: frame.clientTurnId,
      });
      return;
    }

    if (frame.seq !== turn.nextSeq) {
      this.emitError(client, {
        code: ErrorCodes.WS_AUDIO_INVALID,
        message: `Unexpected audio.frame seq=${frame.seq}; expected ${turn.nextSeq}`,
        clientTurnId: frame.clientTurnId,
      });
      this.abortTurn(client, turn);
      return;
    }

    let bytes: Buffer;
    try {
      bytes = this.decodeFrameBytes(frame, attachment);
    } catch (err) {
      this.emitError(client, {
        code: ErrorCodes.WS_AUDIO_INVALID,
        message: err instanceof Error ? err.message : "Invalid audio frame",
        clientTurnId: frame.clientTurnId,
      });
      this.abortTurn(client, turn);
      return;
    }

    if (bytes.length > VOICE_AUDIO_MAX_FRAME_BYTES) {
      this.emitError(client, {
        code: ErrorCodes.AUDIO_TOO_LARGE,
        message: "audio.frame exceeds max frame bytes",
        clientTurnId: frame.clientTurnId,
      });
      this.abortTurn(client, turn);
      return;
    }

    if (bytes.length !== frame.byteLength) {
      this.emitError(client, {
        code: ErrorCodes.WS_AUDIO_INVALID,
        message: "audio.frame byteLength mismatch",
        clientTurnId: frame.clientTurnId,
      });
      this.abortTurn(client, turn);
      return;
    }

    if (turn.totalBytes + bytes.length > VOICE_UTTERANCE_MAX_BYTES) {
      this.emitError(client, {
        code: ErrorCodes.AUDIO_TOO_LARGE,
        message: "Utterance exceeds max uplink bytes",
        clientTurnId: frame.clientTurnId,
      });
      this.abortTurn(client, turn);
      return;
    }

    turn.nextSeq += 1;
    turn.totalBytes += bytes.length;
    turn.audioChunks.push(bytes);
    try {
      await turn.sttSession.pushAudio(bytes);
    } catch (err) {
      this.emitError(client, {
        code: ErrorCodes.WS_STREAM_FAILED,
        message: "STT stream rejected audio frame",
        clientTurnId: frame.clientTurnId,
        retriable: true,
      });
      this.abortTurn(client, turn);
      this.logger.warn(
        `voice.audio.frame stt push failed sessionId=${turn.sessionId}: ${
          err instanceof Error ? err.message : "unknown"
        }`,
      );
    }
  }

  @SubscribeMessage(VoiceWsEvents.TurnEnd)
  async onTurnEnd(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const user = this.requireUser(client);
    if (!user) return;

    const parsed = VoiceTurnEndEventSchema.safeParse(body);
    if (!parsed.success) {
      this.emitError(client, {
        code: ErrorCodes.VALIDATION_ERROR,
        message: "Invalid turn.end payload",
        details: parsed.error.flatten(),
      });
      return;
    }
    const event = parsed.data;

    const turn = this.inflight.get(client.id);
    if (!turn || turn.clientTurnId !== event.clientTurnId) {
      this.emitError(client, {
        code: ErrorCodes.WS_TURN_NOT_FOUND,
        message: "No matching in-progress turn for turn.end",
        clientTurnId: event.clientTurnId,
      });
      return;
    }

    // Remove from inflight before await so a second end cannot double-finalize.
    this.inflight.delete(client.id);

    if (event.lastSeq >= 0 && event.lastSeq !== turn.nextSeq - 1) {
      this.emitError(client, {
        code: ErrorCodes.WS_AUDIO_INVALID,
        message: `turn.end lastSeq=${event.lastSeq} does not match received frames`,
        clientTurnId: event.clientTurnId,
      });
      try {
        turn.sttSession.cancel();
      } catch {
        // ignore
      }
      return;
    }

    if (!this.rateLimiter.tryConsume(user.userId)) {
      try {
        turn.sttSession.cancel();
      } catch {
        // ignore
      }
      this.emitError(client, {
        code: ErrorCodes.WS_RATE_LIMITED,
        message: "Voice turn rate limit exceeded (20/min)",
        clientTurnId: event.clientTurnId,
      });
      return;
    }

    // Idempotent retry after uplink already finalized elsewhere.
    const prior = await this.orchestrator.findPriorTurnResponse(
      turn.sessionId,
      event.clientTurnId,
    );
    if (prior) {
      try {
        turn.sttSession.cancel();
      } catch {
        // ignore
      }
      this.emitTurnDone(client, {
        ...prior,
        clientTurnId: event.clientTurnId,
      });
      return;
    }

    let sttFinal;
    try {
      sttFinal = await turn.sttSession.finalize();
    } catch (err) {
      this.emitHttpMappedError(client, err, event.clientTurnId);
      this.logger.warn(
        `voice.stt.finalize failed sessionId=${turn.sessionId}: ${
          err instanceof Error ? err.message : "unknown"
        }`,
      );
      return;
    }

    const sttPayload: VoiceSttFinalEvent = {
      clientTurnId: event.clientTurnId,
      text: sttFinal.transcript,
      isFinal: true,
    };
    client.emit(VoiceWsEvents.SttFinal, sttPayload);

    const userAudioBytes = Buffer.concat(turn.audioChunks);
    const mimeType = mimeForEncoding(turn.encoding);

    try {
      const response = await this.orchestrator.finalizeVoiceTurn({
        userId: user.userId,
        sessionId: turn.sessionId,
        clientTurnId: event.clientTurnId,
        clientLocale: turn.clientLocale,
        userTranscript: sttFinal.transcript,
        userAudio: userAudioBytes.length
          ? {
              bytes: userAudioBytes,
              mimeType,
              originalname: `uplink.${extForEncoding(turn.encoding)}`,
            }
          : undefined,
        sttProviderName: sttFinal.providerName,
        sttLatencyMs: sttFinal.latencyMs,
        onAssistantText: async (info) => {
          const payload: VoiceAssistantTextEvent = {
            clientTurnId: event.clientTurnId,
            text: info.text,
            avatarCue: "talk",
            safetyMode: info.safetyMode,
          };
          client.emit(VoiceWsEvents.AssistantText, payload);
        },
        onTtsChunk: async (chunk) => {
          const mime = normalizeTtsMime(chunk.mime);
          const payload: VoiceTtsChunkEvent = {
            clientTurnId: event.clientTurnId,
            seq: chunk.seq,
            mime,
            payloadBase64: chunk.bytes.toString("base64"),
            isLast: chunk.isLast,
            byteLength: chunk.bytes.length,
          };
          client.emit(VoiceWsEvents.TtsChunk, payload);
        },
      });

      const data = response.data;
      if (!data) {
        this.emitError(client, {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Finalize returned empty data",
          clientTurnId: event.clientTurnId,
        });
        return;
      }

      this.emitTurnDone(client, {
        turnId: data.turnId,
        sessionId: data.sessionId,
        clientTurnId: event.clientTurnId,
        userTranscript: data.userTranscript,
        assistantText: data.assistantText,
        audioUrl: data.audioUrl,
        provider: data.provider,
        avatarCue: data.avatarCue,
        safetyMode: data.safetyMode,
        ...(data.safetyResources
          ? { safetyResources: data.safetyResources }
          : {}),
        latencyMs: data.latencyMs,
      });

      this.logger.log(
        `voice.turn.done socketId=${client.id} sessionId=${turn.sessionId} turnId=${data.turnId} latencyMs=${data.latencyMs ?? Date.now() - turn.startedAtMs}`,
      );
    } catch (err) {
      this.emitHttpMappedError(client, err, event.clientTurnId);
      this.logger.warn(
        `voice.finalize failed sessionId=${turn.sessionId}: ${
          err instanceof Error ? err.message : "unknown"
        }`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async authenticateSocket(socket: Socket): Promise<AuthUser | null> {
    const token = extractAccessTokenFromHandshake(socket);
    if (!token) return null;
    return verifyVoiceAccessToken(this.jwt, this.secrets, token);
  }

  private requireUser(client: Socket): AuthUser | null {
    const user = getSocketUser(client);
    if (!user) {
      this.emitError(client, {
        code: ErrorCodes.WS_UNAUTHORIZED,
        message: "Unauthenticated socket",
      });
      client.disconnect(true);
      return null;
    }
    return user;
  }

  private decodeFrameBytes(
    frame: {
      payloadBase64?: string;
      binary?: true;
      byteLength: number;
    },
    attachment?: Buffer,
  ): Buffer {
    if (frame.payloadBase64 !== undefined) {
      const bytes = Buffer.from(frame.payloadBase64, "base64");
      if (!bytes.length && frame.byteLength > 0) {
        throw new Error("audio.frame payloadBase64 decoded empty");
      }
      return bytes;
    }
    if (frame.binary === true) {
      if (!attachment || !attachment.length) {
        throw new Error("audio.frame binary:true but no binary attachment");
      }
      return attachment;
    }
    throw new Error("audio.frame missing payload");
  }

  private abortTurn(client: Socket, turn: InflightTurn): void {
    try {
      turn.sttSession.cancel();
    } catch {
      // ignore
    }
    this.inflight.delete(client.id);
  }

  private emitTurnDone(client: Socket, done: VoiceTurnDoneEvent): void {
    client.emit(VoiceWsEvents.TurnDone, done);
  }

  private emitError(client: Socket, error: VoiceErrorEvent): void {
    client.emit(VoiceWsEvents.Error, error);
  }

  private emitHttpMappedError(
    client: Socket,
    err: unknown,
    clientTurnId?: string,
  ): void {
    if (err instanceof HttpException) {
      const status = err.getStatus();
      const body = err.getResponse();
      let code: VoiceErrorEvent["code"] = ErrorCodes.INTERNAL_ERROR;
      let message = "Request failed";
      if (typeof body === "string") {
        message = body;
      } else if (body && typeof body === "object") {
        const record = body as Record<string, unknown>;
        if (typeof record.code === "string") {
          code = record.code as VoiceErrorEvent["code"];
        } else if (status === 401) {
          code = ErrorCodes.UNAUTHORIZED;
        } else if (status === 404) {
          code = ErrorCodes.SESSION_NOT_FOUND;
        } else if (status === 409) {
          code = ErrorCodes.SESSION_CLOSED;
        } else if (status === 429) {
          code = ErrorCodes.RATE_LIMITED;
        } else if (status === 503) {
          code = ErrorCodes.PROVIDER_UNAVAILABLE;
        } else if (status === 504) {
          code = ErrorCodes.TURN_TIMEOUT;
        }
        if (typeof record.message === "string") {
          message = record.message;
        }
      }
      this.emitError(client, {
        code,
        message,
        clientTurnId,
        retriable:
          code === ErrorCodes.PROVIDER_UNAVAILABLE ||
          code === ErrorCodes.TURN_TIMEOUT ||
          code === ErrorCodes.WS_STREAM_FAILED,
      });
      return;
    }
    this.emitError(client, {
      code: ErrorCodes.WS_STREAM_FAILED,
      message: "Voice turn failed",
      clientTurnId,
      retriable: true,
    });
  }
}

function coerceBuffer(value: unknown): Buffer | undefined {
  if (!value) return undefined;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  return undefined;
}

function mimeForEncoding(encoding: VoiceAudioEncoding): string {
  switch (encoding) {
    case "segment_m4a":
      return "audio/mp4";
    case "segment_wav":
      return "audio/wav";
    case "pcm_s16le":
    default:
      return "audio/wav";
  }
}

function extForEncoding(encoding: VoiceAudioEncoding): string {
  switch (encoding) {
    case "segment_m4a":
      return "m4a";
    case "segment_wav":
      return "wav";
    case "pcm_s16le":
    default:
      return "pcm";
  }
}

function normalizeTtsMime(mime: string): VoiceTtsMime {
  const lower = (mime || "audio/wav").toLowerCase();
  const allowed: VoiceTtsMime[] = [
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/mp4",
    "audio/aac",
    "audio/ogg",
  ];
  if ((allowed as string[]).includes(lower)) {
    return lower as VoiceTtsMime;
  }
  if (lower.includes("mpeg") || lower.includes("mp3")) return "audio/mpeg";
  if (lower.includes("wav")) return "audio/wav";
  if (lower.includes("mp4") || lower.includes("m4a")) return "audio/mp4";
  if (lower.includes("aac")) return "audio/aac";
  if (lower.includes("ogg")) return "audio/ogg";
  return "audio/wav";
}
