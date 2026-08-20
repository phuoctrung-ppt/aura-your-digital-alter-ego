import { ConflictException, Inject, Injectable, Optional } from "@nestjs/common";
import {
  ErrorCodes,
  TURN_REQUEST_TIMEOUT_MS,
  ok,
  type CreateTurnFormFields,
  type ProviderInfo,
  type SafetyMode,
  type SafetyResource,
  type TurnResponse,
  type TurnResponseData,
} from "@aura/contracts";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { AppLogger } from "../../common";
import { PrismaService } from "../../prisma/prisma.service";
import { SessionsService } from "../../sessions/sessions.service";
import { SafetyService } from "../../safety/safety.service";
import { MemoryService } from "../../memory/memory.service";
import type { ChatProvider } from "../interfaces/chat-provider";
import type { SttProvider } from "../interfaces/stt-provider";
import type { TtsProvider } from "../interfaces/tts-provider";
import {
  CHAT_PROVIDER,
  CHAT_PROVIDER_FALLBACK,
  STT_PROVIDER,
  STT_PROVIDER_FALLBACK,
  TTS_PROVIDER,
  TTS_PROVIDER_FALLBACK,
} from "../tokens";
import { AudioStorage, extFromMime } from "../audio-storage";
import {
  providerUnavailable,
  turnTimeout,
  withTimeout,
} from "../provider-errors";

/**
 * Uploaded audio shape (Express.Multer.File compatible).
 */
export type TurnAudioUpload = {
  fieldname: string;
  originalname: string;
  mimetype: string;
  size: number;
  buffer?: Buffer;
  path?: string;
};

export type RunTurnInput = {
  userId: string;
  sessionId: string;
  fields: CreateTurnFormFields;
  audio?: TurnAudioUpload;
};

function isChatFallbackConfigured(provider: ChatProvider): boolean {
  if (provider.name === "fake-chat") return true;
  if (typeof provider.isConfigured === "function") {
    return provider.isConfigured();
  }
  // Providers without isConfigured are treated as ready when distinct from primary.
  return true;
}

/**
 * AI orchestrator — STT → safety → LLM → TTS → persist Turn → best-effort memory.
 * Provider chain (guide-gcp/08):
 *   Chat: Ollama → Vertex (default) or OpenAI-compatible when selected
 *   STT:  Whisper → Cloud Speech-to-Text
 *   TTS:  local/silent → Cloud Text-to-Speech
 * Never logs full transcripts / audio payloads (AGENTS.md §6 / §12).
 */
@Injectable()
export class AiOrchestratorService {
  private readonly logger = new AppLogger(AiOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly safety: SafetyService,
    private readonly memory: MemoryService,
    private readonly audioStorage: AudioStorage,
    @Inject(CHAT_PROVIDER) private readonly chatPrimary: ChatProvider,
    @Inject(CHAT_PROVIDER_FALLBACK)
    private readonly chatFallback: ChatProvider,
    @Inject(STT_PROVIDER) private readonly sttPrimary: SttProvider,
    @Optional()
    @Inject(STT_PROVIDER_FALLBACK)
    private readonly sttFallback: SttProvider | null,
    @Inject(TTS_PROVIDER) private readonly ttsPrimary: TtsProvider,
    @Optional()
    @Inject(TTS_PROVIDER_FALLBACK)
    private readonly ttsFallback: TtsProvider | null,
  ) {}

  async runTurn(input: RunTurnInput): Promise<TurnResponse> {
    const wallMs = TURN_REQUEST_TIMEOUT_MS;
    try {
      return await withTimeout(
        this.runTurnInner(input),
        wallMs,
        () => turnTimeout(),
      );
    } catch (err) {
      if (err instanceof Error && "getStatus" in err) throw err;
      this.logger.warn(
        `runTurn failed sessionId=${input.sessionId}: ${
          err instanceof Error ? err.message : "unknown"
        }`,
      );
      throw err;
    }
  }

  private async runTurnInner(input: RunTurnInput): Promise<TurnResponse> {
    const started = Date.now();
    const { userId, sessionId, fields, audio } = input;

    // Idempotency: same sessionId + clientTurnId after success → prior response.
    if (fields.clientTurnId) {
      const prior = await this.findIdempotentResponse(
        sessionId,
        fields.clientTurnId,
      );
      if (prior) {
        this.logger.log(
          `runTurn idempotent hit sessionId=${sessionId} clientTurnId=${fields.clientTurnId}`,
        );
        return ok(prior);
      }
    }

    const session = await this.sessions.findOwnedWithPersona(userId, sessionId);
    if (session.status === "ended") {
      throw new ConflictException({
        code: ErrorCodes.SESSION_CLOSED,
        message: "Session is closed",
      });
    }

    if (!audio) {
      // Controller should already reject; defensive.
      throw providerUnavailable("Audio missing in orchestrator");
    }

    const userTurnId = randomUUID();
    const assistantTurnId = randomUUID();
    const userExt = extFromMime(audio.mimetype, audio.originalname);

    const audioBytes =
      audio.buffer && audio.buffer.length > 0
        ? audio.buffer
        : audio.path
          ? await readFile(audio.path)
          : Buffer.alloc(0);

    if (!audioBytes.length) {
      // Mapped by turns.service usually; keep defensive.
      throw providerUnavailable("Empty audio buffer");
    }

    const userAudioPath = await this.audioStorage.writeBytes(
      sessionId,
      userTurnId,
      "user",
      audioBytes,
      userExt,
    );

    // 1) STT (primary → GCP Speech fallback)
    const sttResult = await this.runSttWithFallback({
      audio: audioBytes,
      mimeType: audio.mimetype,
      locale: fields.clientLocale ?? session.locale,
      sessionId,
    });
    const userTranscript = sttResult.transcript;

    // 2) Safety pre-check
    let safetyMode: SafetyMode = "normal";
    let safetyResources: SafetyResource[] | undefined;
    const pre = await this.safety.checkUserText({
      userId,
      sessionId,
      text: userTranscript,
    });
    if (pre.hit) {
      safetyMode = "safe-listener";
      safetyResources = this.safety.resources();
      await this.persistSafetyEvent(
        userId,
        sessionId,
        pre.category ?? "self-harm",
        "safe-listener",
      );
    }

    // 3) Chat (skip pressure persona when already in safe-listener)
    let assistantText: string;
    let chatProviderName: string;

    if (safetyMode === "safe-listener") {
      assistantText = this.safety.safeListenerReply();
      chatProviderName = "safe-listener";
    } else {
      const chat = await this.runChatWithFallback({
        userId,
        sessionId,
        personaSystemPrompt: session.persona.systemPromptText,
        personaId: session.persona.id,
        locale: session.locale,
        userTranscript,
      });
      assistantText = chat.text;
      chatProviderName = chat.providerName;

      const post = await this.safety.checkAssistantText({
        userId,
        sessionId,
        text: assistantText,
      });
      if (post.hit) {
        safetyMode = "safe-listener";
        safetyResources = this.safety.resources();
        assistantText = this.safety.safeListenerReply();
        chatProviderName = "safe-listener";
        await this.persistSafetyEvent(
          userId,
          sessionId,
          post.category ?? "self-harm",
          "safe-listener",
        );
      }
    }

    // 4) TTS on final assistant text (including safe reply)
    const ttsResult = await this.runTtsWithFallback({
      text: assistantText,
      locale: fields.clientLocale ?? session.locale,
      sessionId,
    });
    const assistantExt = extFromMime(
      ttsResult.mimeType ?? "audio/wav",
      ttsResult.audioUri,
    );
    const assistantAudioPath = await this.audioStorage.placeFile(
      sessionId,
      assistantTurnId,
      "assistant",
      ttsResult.audioUri,
      assistantExt,
    );

    const providers: ProviderInfo = {
      stt: sttResult.providerName,
      chat: chatProviderName,
      tts: ttsResult.providerName,
    };
    const latencyMs = Date.now() - started;
    const audioUrl = `/v1/sessions/${sessionId}/turns/${assistantTurnId}/audio`;
    const clientTurnId = fields.clientTurnId ?? null;

    // 5) Persist user + assistant turns
    await this.prisma.$transaction([
      this.prisma.turn.create({
        data: {
          id: userTurnId,
          sessionId,
          role: "user",
          transcript: userTranscript,
          audioUri: userAudioPath,
          latencyMs: sttResult.latencyMs ?? null,
          providers,
          clientTurnId,
        },
      }),
      this.prisma.turn.create({
        data: {
          id: assistantTurnId,
          sessionId,
          role: "assistant",
          transcript: assistantText,
          audioUri: assistantAudioPath,
          latencyMs,
          providers,
          clientTurnId: null,
        },
      }),
    ]);

    this.logger.log(
      `runTurn ok sessionId=${sessionId} turnId=${assistantTurnId} ` +
        `providers=${providers.stt}/${providers.chat}/${providers.tts} ` +
        `latencyMs=${latencyMs} safety=${safetyMode}`,
    );

    // 6) Best-effort memory (do not fail the turn)
    void this.memory.extractBestEffort({
      userId,
      sessionId,
      personaId: session.persona.id,
      sourceTurnId: userTurnId,
      userTranscript,
      assistantText,
    });

    const data: TurnResponseData = {
      turnId: assistantTurnId,
      sessionId,
      clientTurnId,
      userTranscript,
      assistantText,
      audioUrl,
      provider: providers,
      avatarCue: "talk",
      safetyMode,
      ...(safetyResources ? { safetyResources } : {}),
      latencyMs,
    };
    return ok(data);
  }

  private async runSttWithFallback(args: {
    audio: Buffer;
    mimeType: string;
    locale?: string;
    sessionId: string;
  }): Promise<{ transcript: string; providerName: string; latencyMs?: number }> {
    try {
      return await this.sttPrimary.transcribe({
        audio: args.audio,
        mimeType: args.mimeType,
        locale: args.locale,
      });
    } catch (primaryErr) {
      const fallback = this.sttFallback;
      const canFallback =
        fallback != null && fallback.name !== this.sttPrimary.name;

      this.logger.warn(
        `stt.primary failed provider=${this.sttPrimary.name} sessionId=${args.sessionId} — attempting fallback=${canFallback}`,
      );

      if (!canFallback || !fallback) {
        if (primaryErr instanceof Error && "getStatus" in primaryErr) {
          throw primaryErr;
        }
        throw providerUnavailable(
          "Primary STT provider failed and no fallback is configured",
        );
      }

      try {
        const secondary = await fallback.transcribe({
          audio: args.audio,
          mimeType: args.mimeType,
          locale: args.locale,
        });
        const providerName =
          secondary.providerName === "gcp-speech" ||
          fallback.name === "gcp-speech"
            ? "fallback-gcp-speech"
            : `fallback-${secondary.providerName}`;
        this.logger.log(
          `stt.fallback ok provider=${providerName} sessionId=${args.sessionId}`,
        );
        return {
          transcript: secondary.transcript,
          providerName,
          latencyMs: secondary.latencyMs,
        };
      } catch (fallbackErr) {
        this.logger.warn(
          `stt.fallback failed provider=${fallback.name} sessionId=${args.sessionId}`,
        );
        throw providerUnavailable(
          "STT providers unavailable (primary + fallback failed)",
        );
      }
    }
  }

  private async runTtsWithFallback(args: {
    text: string;
    locale?: string;
    sessionId: string;
  }): Promise<{
    audioUri: string;
    providerName: string;
    mimeType?: string;
    latencyMs?: number;
  }> {
    try {
      return await this.ttsPrimary.synthesize({
        text: args.text,
        locale: args.locale,
      });
    } catch (primaryErr) {
      const fallback = this.ttsFallback;
      const canFallback =
        fallback != null && fallback.name !== this.ttsPrimary.name;

      this.logger.warn(
        `tts.primary failed provider=${this.ttsPrimary.name} sessionId=${args.sessionId} — attempting fallback=${canFallback}`,
      );

      if (!canFallback || !fallback) {
        if (primaryErr instanceof Error && "getStatus" in primaryErr) {
          throw primaryErr;
        }
        throw providerUnavailable(
          "Primary TTS provider failed and no fallback is configured",
        );
      }

      try {
        const secondary = await fallback.synthesize({
          text: args.text,
          locale: args.locale,
        });
        const providerName =
          secondary.providerName === "gcp-tts" || fallback.name === "gcp-tts"
            ? "fallback-gcp-tts"
            : `fallback-${secondary.providerName}`;
        this.logger.log(
          `tts.fallback ok provider=${providerName} sessionId=${args.sessionId}`,
        );
        return {
          audioUri: secondary.audioUri,
          providerName,
          mimeType: secondary.mimeType,
          latencyMs: secondary.latencyMs,
        };
      } catch (fallbackErr) {
        this.logger.warn(
          `tts.fallback failed provider=${fallback.name} sessionId=${args.sessionId}`,
        );
        throw providerUnavailable(
          "TTS providers unavailable (primary + fallback failed)",
        );
      }
    }
  }

  private async runChatWithFallback(args: {
    userId: string;
    sessionId: string;
    personaSystemPrompt: string;
    personaId: string;
    locale: string;
    userTranscript: string;
  }): Promise<{ text: string; providerName: string }> {
    const recent = await this.prisma.turn.findMany({
      where: { sessionId: args.sessionId },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { role: true, transcript: true },
    });
    const history = recent
      .reverse()
      .filter((t) => (t.transcript ?? "").trim().length > 0)
      .map((t) => ({
        role: (t.role === "user" ? "user" : "assistant") as
          | "user"
          | "assistant",
        content: t.transcript as string,
      }));

    let memoryFacts: string[] = [];
    try {
      memoryFacts = await this.memory.listActiveFacts(args.userId, {
        personaId: args.personaId,
        limit: 8,
      });
    } catch (err) {
      this.logger.warn(
        `memory.listActiveFacts failed sessionId=${args.sessionId}: ${
          err instanceof Error ? err.message : "unknown"
        }`,
      );
    }

    const memoryBlock =
      memoryFacts.length > 0
        ? `\n\n[Known memory facts — use naturally, do not dump as a list]\n- ${memoryFacts.join("\n- ")}`
        : "";

    const messages = [
      {
        role: "system" as const,
        content: `${args.personaSystemPrompt}${memoryBlock}\n\nReply in locale=${args.locale}. Keep answers concise for voice.`,
      },
      ...history,
      { role: "user" as const, content: args.userTranscript },
    ];

    try {
      const primary = await this.chatPrimary.chat({ messages });
      return { text: primary.text, providerName: primary.providerName };
    } catch (primaryErr) {
      const distinct =
        this.chatFallback.name !== this.chatPrimary.name;
      const fallbackConfigured =
        distinct && isChatFallbackConfigured(this.chatFallback);

      this.logger.warn(
        `chat.primary failed provider=${this.chatPrimary.name} sessionId=${args.sessionId} — attempting fallback=${fallbackConfigured}`,
      );

      if (!fallbackConfigured) {
        throw providerUnavailable(
          "Primary chat provider failed and no fallback is configured",
        );
      }

      try {
        const secondary = await this.chatFallback.chat({ messages });
        this.logger.log(
          `chat.fallback ok provider=${secondary.providerName} sessionId=${args.sessionId}`,
        );
        return { text: secondary.text, providerName: secondary.providerName };
      } catch (fallbackErr) {
        this.logger.warn(
          `chat.fallback failed provider=${this.chatFallback.name} sessionId=${args.sessionId}`,
        );
        throw providerUnavailable(
          `Chat providers unavailable (primary + fallback failed)`,
        );
      }
    }
  }

  private async persistSafetyEvent(
    userId: string,
    sessionId: string,
    category: string,
    actionTaken: string,
  ): Promise<void> {
    try {
      await this.prisma.safetyEvent.create({
        data: { userId, sessionId, category, actionTaken },
      });
    } catch (err) {
      this.logger.warn(
        `safetyEvent.persist failed sessionId=${sessionId}: ${
          err instanceof Error ? err.message : "unknown"
        }`,
      );
    }
  }

  private async findIdempotentResponse(
    sessionId: string,
    clientTurnId: string,
  ): Promise<TurnResponseData | null> {
    const userTurn = await this.prisma.turn.findFirst({
      where: {
        sessionId,
        clientTurnId,
        role: "user",
      },
    });
    if (!userTurn) return null;

    // Assistant turn created in the same request shortly after user turn.
    const assistantTurn = await this.prisma.turn.findFirst({
      where: {
        sessionId,
        role: "assistant",
        createdAt: { gte: userTurn.createdAt },
      },
      orderBy: { createdAt: "asc" },
    });
    if (!assistantTurn) return null;

    const providers = (assistantTurn.providers ??
      userTurn.providers ?? {
        stt: "unknown",
        chat: "unknown",
        tts: "unknown",
      }) as ProviderInfo;

    return {
      turnId: assistantTurn.id,
      sessionId,
      clientTurnId,
      userTranscript: userTurn.transcript ?? "",
      assistantText: assistantTurn.transcript ?? "",
      audioUrl: `/v1/sessions/${sessionId}/turns/${assistantTurn.id}/audio`,
      provider: providers,
      avatarCue: "talk",
      safetyMode: "normal",
      latencyMs: assistantTurn.latencyMs ?? undefined,
    };
  }
}
