import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UsersService } from "src/users";
import { MemoryModule } from "../memory/memory.module";
import { SafetyModule } from "../safety/safety.module";
import { SessionsModule } from "../sessions/sessions.module";
import { AudioStorage } from "./audio-storage";
import { VoiceController } from "./controllers/voice.controller";
import { AiOrchestratorService } from "./orchestrator/ai-orchestrator.service";
import { FakeChatProvider } from "./providers/fake-chat.provider";
import { FakeStreamingSttProvider } from "./providers/fake-streaming-stt.provider";
import { FakeSttProvider } from "./providers/fake-stt.provider";
import { FakeTtsProvider } from "./providers/fake-tts.provider";
import { GcpSpeechStreamingSttProvider } from "./providers/gcp-speech-streaming.stt";
import { GcpSpeechSttProvider } from "./providers/gcp-speech-stt.provider";
import { GcpTextToSpeechProvider } from "./providers/gcp-tts.provider";
import { OllamaChatProvider } from "./providers/ollama-chat.provider";
import { OpenAiCompatibleChatProvider } from "./providers/openai-compatible-chat.provider";
import { TtsProviderImpl } from "./providers/tts.provider";
import { VertexChatProvider } from "./providers/vertex-chat.provider";
import { WhisperSttProvider } from "./providers/whisper-stt.provider";
import { VoiceService } from "./services/voice.service";
import {
  CHAT_PROVIDER,
  CHAT_PROVIDER_FALLBACK,
  STREAMING_STT_PROVIDER,
  STT_PROVIDER,
  STT_PROVIDER_FALLBACK,
  TTS_PROVIDER,
  TTS_PROVIDER_FALLBACK,
} from "./tokens";

function isFakeMode(config: ConfigService): boolean {
  return envFlag(config.get<string>("AI_PROVIDER_MODE")) === "fake";
}

/**
 * Normalize dotenv tokens. Inline `# ...` comments sometimes leak into values
 * when a line is written as `KEY=vertex  # comment` without quotes — strip them.
 */
function envFlag(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+#/, 1)[0]!.trim().toLowerCase();
}

/**
 * AI module — provider registry + orchestrator (ADR-0003 / guide-gcp/08).
 *
 * Selection:
 * - `AI_PROVIDER_MODE=fake` → Fake* providers for chat/STT/TTS (smoke/CI default)
 * - Chat primary: Ollama; fallback default Vertex (`CHAT_FALLBACK_PROVIDER=vertex`),
 *   optional OpenAI-compatible when `CHAT_FALLBACK_PROVIDER=openai_compatible`
 * - STT: Whisper primary (or `gcp` / `fake`); fallback `STT_FALLBACK_PROVIDER=gcp` (default)
 * - TTS: local/silent primary (or `gcp` / `fake`); fallback `TTS_FALLBACK_PROVIDER=gcp` (default)
 *
 * Never hard-codes a cloud-only path (AGENTS.md §12).
 */
@Module({
  imports: [SessionsModule, SafetyModule, MemoryModule],
  controllers: [VoiceController],
  providers: [
    VoiceService,
    AudioStorage,
    OllamaChatProvider,
    OpenAiCompatibleChatProvider,
    VertexChatProvider,
    WhisperSttProvider,
    GcpSpeechSttProvider,
    TtsProviderImpl,
    GcpTextToSpeechProvider,
    FakeChatProvider,
    FakeSttProvider,
    FakeTtsProvider,
    FakeStreamingSttProvider,
    GcpSpeechStreamingSttProvider,
    UsersService,
    {
      provide: CHAT_PROVIDER,
      inject: [ConfigService, FakeChatProvider, OllamaChatProvider],
      useFactory: (
        config: ConfigService,
        fake: FakeChatProvider,
        ollama: OllamaChatProvider,
      ) => (isFakeMode(config) ? fake : ollama),
    },
    {
      provide: CHAT_PROVIDER_FALLBACK,
      inject: [
        ConfigService,
        FakeChatProvider,
        VertexChatProvider,
        OpenAiCompatibleChatProvider,
      ],
      useFactory: (
        config: ConfigService,
        fake: FakeChatProvider,
        vertex: VertexChatProvider,
        openai: OpenAiCompatibleChatProvider,
      ) => {
        if (isFakeMode(config)) return fake;
        const mode =
          envFlag(config.get<string>("CHAT_FALLBACK_PROVIDER")) || "vertex";
        if (mode === "none" || mode === "off") {
          // Explicit opt-out — orchestrator will report "no fallback configured".
          return fake;
        }
        if (mode === "openai_compatible" || mode === "openai-compatible") {
          return openai;
        }
        // Default / `vertex`
        return vertex;
      },
    },
    {
      provide: STT_PROVIDER,
      inject: [
        ConfigService,
        FakeSttProvider,
        WhisperSttProvider,
        GcpSpeechSttProvider,
      ],
      useFactory: (
        config: ConfigService,
        fake: FakeSttProvider,
        whisper: WhisperSttProvider,
        gcp: GcpSpeechSttProvider,
      ) => {
        if (isFakeMode(config)) return fake;
        const stt = (config.get<string>("STT_PROVIDER") ?? "")
          .trim()
          .toLowerCase();
        if (stt === "fake") return fake;
        if (stt === "gcp" || stt === "gcp-speech") return gcp;
        return whisper;
      },
    },
    {
      provide: STT_PROVIDER_FALLBACK,
      inject: [ConfigService, FakeSttProvider, GcpSpeechSttProvider],
      useFactory: (
        config: ConfigService,
        fake: FakeSttProvider,
        gcp: GcpSpeechSttProvider,
      ) => {
        if (isFakeMode(config)) return fake;
        const fallback = (config.get<string>("STT_FALLBACK_PROVIDER") ?? "gcp")
          .trim()
          .toLowerCase();
        if (fallback === "fake" || fallback === "none" || fallback === "off") {
          return fake;
        }
        // Default / `gcp`
        return gcp;
      },
    },
    {
      provide: TTS_PROVIDER,
      inject: [
        ConfigService,
        FakeTtsProvider,
        TtsProviderImpl,
        GcpTextToSpeechProvider,
      ],
      useFactory: (
        config: ConfigService,
        fake: FakeTtsProvider,
        local: TtsProviderImpl,
        gcp: GcpTextToSpeechProvider,
      ) => {
        if (isFakeMode(config)) return fake;
        const tts = (config.get<string>("TTS_PROVIDER") ?? "")
          .trim()
          .toLowerCase();
        if (tts === "fake") return fake;
        if (tts === "gcp" || tts === "gcp-tts") return gcp;
        return local;
      },
    },
    {
      provide: TTS_PROVIDER_FALLBACK,
      inject: [ConfigService, FakeTtsProvider, GcpTextToSpeechProvider],
      useFactory: (
        config: ConfigService,
        fake: FakeTtsProvider,
        gcp: GcpTextToSpeechProvider,
      ) => {
        if (isFakeMode(config)) return fake;
        const fallback = (config.get<string>("TTS_FALLBACK_PROVIDER") ?? "gcp")
          .trim()
          .toLowerCase();
        if (fallback === "fake" || fallback === "none" || fallback === "off") {
          return fake;
        }
        // Default / `gcp`
        return gcp;
      },
    },
    {
      provide: STREAMING_STT_PROVIDER,
      inject: [
        ConfigService,
        FakeStreamingSttProvider,
        GcpSpeechStreamingSttProvider,
      ],
      useFactory: (
        config: ConfigService,
        fake: FakeStreamingSttProvider,
        gcpStream: GcpSpeechStreamingSttProvider,
      ) => {
        if (isFakeMode(config)) return fake;
        const stt = (config.get<string>("STT_PROVIDER") ?? "")
          .trim()
          .toLowerCase();
        if (stt === "fake") return fake;
        // WS path prefers GCP streaming (SP-4); fake mode handled above.
        return gcpStream;
      },
    },
    AiOrchestratorService,
  ],
  exports: [
    AiOrchestratorService,
    AudioStorage,
    CHAT_PROVIDER,
    CHAT_PROVIDER_FALLBACK,
    STT_PROVIDER,
    STT_PROVIDER_FALLBACK,
    TTS_PROVIDER,
    TTS_PROVIDER_FALLBACK,
    STREAMING_STT_PROVIDER,
    OllamaChatProvider,
    OpenAiCompatibleChatProvider,
    VertexChatProvider,
    WhisperSttProvider,
    GcpSpeechSttProvider,
    GcpSpeechStreamingSttProvider,
    TtsProviderImpl,
    GcpTextToSpeechProvider,
    FakeChatProvider,
    FakeSttProvider,
    FakeTtsProvider,
    FakeStreamingSttProvider,
  ],
})
export class AiModule {}
