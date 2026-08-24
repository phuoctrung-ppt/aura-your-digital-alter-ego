import { z } from "zod";
import {
  AvatarCueSchema,
  DEFAULT_LOCALE,
  LocaleSchema,
  ProviderInfoSchema,
  SafetyModeSchema,
  UuidSchema,
} from "./common.js";
import { ErrorCodeSchema } from "./error-codes.js";
import {
  SafetyResourceSchema,
  TURN_AUDIO_MAX_BYTES,
  TURN_AUDIO_MAX_DURATION_MS,
  TURN_CLIENT_DURATION_MS_MAX,
} from "./turns.js";

/**
 * Socket.IO streaming-PTT wire contracts (M7.5 / ADR-0005 / SP-4).
 *
 * Namespace is **not** the Socket.IO Engine.IO path (`/socket.io`); it is the
 * Socket.IO namespace joined after connect, e.g. `io(WS_URL + VOICE_WS_NAMESPACE)`.
 *
 * REST multipart `POST /v1/sessions/:id/turns` (SP-3 / `turns.ts`) remains the
 * CI / fake / degraded fallback and is unchanged by this module.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Socket.IO namespace for authenticated voice turns. */
export const VOICE_WS_NAMESPACE = "/v1/voice" as const;

/** Preferred uplink PCM sample rate (GCP streamingRecognize friendly). */
export const VOICE_PCM_SAMPLE_RATE_HZ = 16_000 as const;

/** Preferred uplink channel count (mono). */
export const VOICE_PCM_CHANNELS = 1 as const;

/** Preferred uplink PCM encoding id (little-endian signed 16-bit). */
export const VOICE_PCM_ENCODING = "pcm_s16le" as const;

/**
 * Max bytes per `audio.frame` payload (base64-decoded or binary attachment).
 * ~2 s of PCM16@16kHz mono ≈ 64 KiB; hybrid m4a/wav segments stay under this.
 */
export const VOICE_AUDIO_MAX_FRAME_BYTES = 64 * 1024;

/** Max held-PTT utterance duration — aligned with SP-3. */
export const VOICE_UTTERANCE_MAX_DURATION_MS = TURN_AUDIO_MAX_DURATION_MS;

/** Max total uplink bytes per turn (all frames summed) — aligned with SP-3 5 MiB. */
export const VOICE_UTTERANCE_MAX_BYTES = TURN_AUDIO_MAX_BYTES;

/** Client may report slightly over hard-stop due to clock skew. */
export const VOICE_CLIENT_DURATION_MS_MAX = TURN_CLIENT_DURATION_MS_MAX;

/**
 * Locked Socket.IO event names.
 * Emit/listen with these exact strings — do not rename without `[BREAKING]`.
 */
export const VoiceWsEvents = {
  /** Client → server: begin a PTT turn. */
  TurnStart: "turn.start",
  /** Client → server: audio frame (PCM or hybrid segment). */
  AudioFrame: "audio.frame",
  /** Client → server: end uplink; server finalizes STT and runs orchestrator. */
  TurnEnd: "turn.end",
  /** Server → client: interim STT hypothesis (UI may ignore). */
  SttPartial: "stt.partial",
  /** Server → client: final user transcript for this turn. */
  SttFinal: "stt.final",
  /** Server → client: assistant reply text (may precede or interleave TTS). */
  AssistantText: "assistant.text",
  /** Server → client: TTS audio chunk (sentence/phrase synthesize). */
  TtsChunk: "tts.chunk",
  /** Server → client: turn complete summary (persist ack). */
  TurnDone: "turn.done",
  /** Server → client: turn/stream/auth error. */
  Error: "error",
} as const;

export type VoiceWsEventName =
  (typeof VoiceWsEvents)[keyof typeof VoiceWsEvents];

/** Uplink encodings supported on the same event surface (SP-4 hybrid). */
export const VoiceAudioEncodingSchema = z.enum([
  "pcm_s16le",
  "segment_m4a",
  "segment_wav",
]);
export type VoiceAudioEncoding = z.infer<typeof VoiceAudioEncodingSchema>;

/** Downlink TTS chunk MIME allow-list (v1). */
export const VoiceTtsMimeSchema = z.enum([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
]);
export type VoiceTtsMime = z.infer<typeof VoiceTtsMimeSchema>;

// ---------------------------------------------------------------------------
// Client → server
// ---------------------------------------------------------------------------

/**
 * `turn.start` — open a streaming turn on an owned open session.
 *
 * Auth: JWT already validated on Socket.IO connect (`auth.token` = access JWT).
 * Server must verify `sessionId` ownership + `status === "open"`.
 */
export const VoiceTurnStartEventSchema = z.object({
  sessionId: UuidSchema,
  /** Required for WS idempotency / frame correlation (unlike optional REST field). */
  clientTurnId: UuidSchema,
  clientLocale: LocaleSchema.optional().default(DEFAULT_LOCALE),
  encoding: VoiceAudioEncodingSchema.default(VOICE_PCM_ENCODING),
  /**
   * Sample rate for `pcm_s16le`. Ignored for segment encodings (container rate).
   * Locked to 16000 Hz in v1 (SP-4).
   */
  sampleRateHz: z
    .literal(VOICE_PCM_SAMPLE_RATE_HZ)
    .default(VOICE_PCM_SAMPLE_RATE_HZ),
  /** Channel count for PCM; must be mono in v1. */
  channels: z.literal(VOICE_PCM_CHANNELS).default(VOICE_PCM_CHANNELS),
});

export type VoiceTurnStartEvent = z.infer<typeof VoiceTurnStartEventSchema>;

/**
 * `audio.frame` — one uplink chunk while PTT is held.
 *
 * **Payload carriage (pick one per frame):**
 * 1. **Base64 JSON** — set `payloadBase64` (UTF-8 JSON event only). Preferred when
 *    RN Socket.IO binary is unreliable; SP-4 allows this explicitly.
 * 2. **Binary attachment** — set `binary: true` and omit `payloadBase64`. Emit as a
 *    Socket.IO event whose second argument (or binary attachment) is the raw
 *    `ArrayBuffer` / `Buffer` of length `byteLength`. Metadata is the first arg.
 *
 * `seq` is monotonic per `clientTurnId`, starting at **0**.
 * Prefer `turn.end` to mark completion; `isLast: true` is optional early signal.
 */
export const VoiceAudioFrameEventSchema = z
  .object({
    clientTurnId: UuidSchema,
    seq: z.number().int().nonnegative(),
    payloadBase64: z.string().min(1).optional(),
    /** When true, raw bytes arrive as Socket.IO binary attachment (not in JSON). */
    binary: z.literal(true).optional(),
    byteLength: z
      .number()
      .int()
      .positive()
      .max(VOICE_AUDIO_MAX_FRAME_BYTES),
    isLast: z.boolean().optional().default(false),
  })
  .superRefine((val, ctx) => {
    const hasB64 = val.payloadBase64 !== undefined;
    const hasBinary = val.binary === true;
    if (hasB64 === hasBinary) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "audio.frame requires exactly one of payloadBase64 or binary:true",
        path: hasB64 ? ["payloadBase64"] : ["binary"],
      });
    }
  });

export type VoiceAudioFrameEvent = z.infer<typeof VoiceAudioFrameEventSchema>;

/**
 * `turn.end` — client finished uplink; server should close STT stream and finalize.
 */
export const VoiceTurnEndEventSchema = z.object({
  clientTurnId: UuidSchema,
  clientDurationMs: z
    .number()
    .int()
    .min(0)
    .max(VOICE_CLIENT_DURATION_MS_MAX)
    .optional(),
  /** Last `audio.frame.seq` sent (inclusive). -1 if no frames (empty hold). */
  lastSeq: z.number().int().min(-1),
});

export type VoiceTurnEndEvent = z.infer<typeof VoiceTurnEndEventSchema>;

// ---------------------------------------------------------------------------
// Server → client
// ---------------------------------------------------------------------------

/** Shared STT payload fields. */
const VoiceSttBaseSchema = z.object({
  clientTurnId: UuidSchema,
  text: z.string(),
  /**
   * Convenience flag mirroring the event name:
   * `stt.partial` → false; `stt.final` → true.
   */
  isFinal: z.boolean(),
});

/**
 * `stt.partial` — interim hypothesis. Optional for UI; server may emit zero or more.
 * Always `isFinal: false`.
 */
export const VoiceSttPartialEventSchema = VoiceSttBaseSchema.extend({
  isFinal: z.literal(false),
});
export type VoiceSttPartialEvent = z.infer<typeof VoiceSttPartialEventSchema>;

/**
 * `stt.final` — committed user transcript for this turn. Always emit once per
 * successful uplink finalize (before or with assistant pipeline).
 * Always `isFinal: true`.
 */
export const VoiceSttFinalEventSchema = VoiceSttBaseSchema.extend({
  isFinal: z.literal(true),
});
export type VoiceSttFinalEvent = z.infer<typeof VoiceSttFinalEventSchema>;

/**
 * `assistant.text` — persona reply text (safety-aware). May arrive before TTS
 * chunks finish. Drive avatar cue from this + `tts.chunk` lifecycle.
 */
export const VoiceAssistantTextEventSchema = z.object({
  clientTurnId: UuidSchema,
  text: z.string(),
  avatarCue: AvatarCueSchema.optional(),
  safetyMode: SafetyModeSchema.optional(),
});
export type VoiceAssistantTextEvent = z.infer<
  typeof VoiceAssistantTextEventSchema
>;

/**
 * `tts.chunk` — one synthesized audio segment for playback queue (SP-1 RMS).
 * `seq` monotonic from 0 per `clientTurnId`. `isLast: true` ends the stream.
 */
export const VoiceTtsChunkEventSchema = z.object({
  clientTurnId: UuidSchema,
  seq: z.number().int().nonnegative(),
  mime: VoiceTtsMimeSchema,
  payloadBase64: z.string().min(1),
  isLast: z.boolean(),
  byteLength: z.number().int().positive().optional(),
});
export type VoiceTtsChunkEvent = z.infer<typeof VoiceTtsChunkEventSchema>;

/**
 * `turn.done` — persistence + metrics ack. Aligns with REST `TurnResponseData`
 * essentials; `clientTurnId` is always set on WS; `audioUrl` optional when the
 * full reply was delivered via `tts.chunk`.
 */
export const VoiceTurnDoneEventSchema = z.object({
  turnId: UuidSchema,
  sessionId: UuidSchema,
  clientTurnId: UuidSchema,
  userTranscript: z.string(),
  assistantText: z.string(),
  /** Optional replay URL when server also persisted a concatenated blob. */
  audioUrl: z.string().min(1).optional(),
  provider: ProviderInfoSchema,
  avatarCue: AvatarCueSchema,
  safetyMode: SafetyModeSchema,
  safetyResources: z.array(SafetyResourceSchema).optional(),
  latencyMs: z.number().int().nonnegative().optional(),
});
export type VoiceTurnDoneEvent = z.infer<typeof VoiceTurnDoneEventSchema>;

/**
 * `error` — WS turn/stream failure. Not wrapped in REST `{ data, error }` envelope;
 * event payload *is* the error object (+ optional turn correlation).
 */
export const VoiceErrorEventSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string().min(1),
  clientTurnId: UuidSchema.optional(),
  /** Hint for client retry UX (e.g. PROVIDER_UNAVAILABLE / WS_STREAM_FAILED). */
  retriable: z.boolean().optional(),
  details: z.unknown().optional(),
});
export type VoiceErrorEvent = z.infer<typeof VoiceErrorEventSchema>;

// ---------------------------------------------------------------------------
// Maps (documentation / exhaustiveness helpers)
// ---------------------------------------------------------------------------

/** Client → server event name → payload schema. */
export const VoiceWsClientEventSchemas = {
  [VoiceWsEvents.TurnStart]: VoiceTurnStartEventSchema,
  [VoiceWsEvents.AudioFrame]: VoiceAudioFrameEventSchema,
  [VoiceWsEvents.TurnEnd]: VoiceTurnEndEventSchema,
} as const;

/** Server → client event name → payload schema. */
export const VoiceWsServerEventSchemas = {
  [VoiceWsEvents.SttPartial]: VoiceSttPartialEventSchema,
  [VoiceWsEvents.SttFinal]: VoiceSttFinalEventSchema,
  [VoiceWsEvents.AssistantText]: VoiceAssistantTextEventSchema,
  [VoiceWsEvents.TtsChunk]: VoiceTtsChunkEventSchema,
  [VoiceWsEvents.TurnDone]: VoiceTurnDoneEventSchema,
  [VoiceWsEvents.Error]: VoiceErrorEventSchema,
} as const;
