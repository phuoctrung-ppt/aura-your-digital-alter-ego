import { z } from "zod";
import {
  AvatarCueSchema,
  DEFAULT_LOCALE,
  LocaleSchema,
  ProviderInfoSchema,
  SafetyModeSchema,
  UuidSchema,
} from "./common.js";
import { successEnvelopeSchema } from "./envelope.js";

/**
 * SP-3 locked limits (also documented in docs/contracts/v1-aura.md).
 * Enforced by API multer/guards; Zod validates scalar form fields only.
 */
export const TURN_AUDIO_MAX_BYTES = 5 * 1024 * 1024; // 5 MiB
export const TURN_AUDIO_MAX_DURATION_MS = 60_000;
/** Client may report slightly over hard-stop due to clock skew; reject above this. */
export const TURN_CLIENT_DURATION_MS_MAX = 90_000;
export const TURN_REQUEST_TIMEOUT_MS = 120_000;
export const TURN_UPLOAD_NETWORK_BUDGET_MS = 30_000;

/** Primary + secondary MIME allow-list (SP-3). */
export const AcceptedAudioMimeSchema = z.enum([
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
]);

export type AcceptedAudioMime = z.infer<typeof AcceptedAudioMimeSchema>;

export const ACCEPTED_AUDIO_MIMES: readonly AcceptedAudioMime[] =
  AcceptedAudioMimeSchema.options;

/**
 * Multipart form scalar fields for `POST /v1/sessions/:id/turns`.
 * File field name is exactly `audio` (not modeled in JSON Zod).
 *
 * All values arrive as strings from FormData; coerce numbers.
 */
export const CreateTurnFormFieldsSchema = z.object({
  clientDurationMs: z.coerce
    .number()
    .int()
    .min(0)
    .max(TURN_CLIENT_DURATION_MS_MAX)
    .optional(),
  clientLocale: LocaleSchema.optional().default(DEFAULT_LOCALE),
  /** Client-generated idempotency key (uuid recommended). */
  clientTurnId: UuidSchema.optional(),
});

export type CreateTurnFormFields = z.infer<typeof CreateTurnFormFieldsSchema>;

/** Alias used in task breakdown. */
export const CreateTurnRequestMetaSchema = CreateTurnFormFieldsSchema;
export type CreateTurnRequestMeta = CreateTurnFormFields;

/** Local help resource shown when safetyMode is safe-listener (VN-first). */
export const SafetyResourceSchema = z.object({
  title: z.string().min(1),
  /** Phone, URL, or short instruction. */
  value: z.string().min(1),
  kind: z.enum(["phone", "url", "text"]).default("text"),
});

export type SafetyResource = z.infer<typeof SafetyResourceSchema>;

/**
 * Successful turn orchestration payload (sync; queue layer off).
 * Matches SP-3 response notes.
 */
export const TurnResponseDataSchema = z.object({
  turnId: UuidSchema,
  sessionId: UuidSchema,
  clientTurnId: UuidSchema.nullable(),
  userTranscript: z.string(),
  assistantText: z.string(),
  /** Playable TTS URL (authenticated or short-lived; serving path is API concern). */
  audioUrl: z.string().min(1),
  provider: ProviderInfoSchema,
  avatarCue: AvatarCueSchema,
  safetyMode: SafetyModeSchema,
  /** Present when safetyMode === "safe-listener". */
  safetyResources: z.array(SafetyResourceSchema).optional(),
  /** Server total turn latency (optional metric). */
  latencyMs: z.number().int().nonnegative().optional(),
});

export type TurnResponseData = z.infer<typeof TurnResponseDataSchema>;
export const TurnResponseSchema = successEnvelopeSchema(TurnResponseDataSchema);
export type TurnResponse = z.infer<typeof TurnResponseSchema>;
