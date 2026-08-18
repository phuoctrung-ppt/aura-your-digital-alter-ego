import { z } from "zod";

/**
 * Stable API error codes. Clients branch on `code`, not `message`.
 * HTTP status is advisory (documented in v1-aura contract); body always uses envelope.
 */
export const ErrorCodeSchema = z.enum([
  // Auth
  "UNAUTHORIZED",
  "FORBIDDEN",
  "INVALID_CREDENTIALS",
  "EMAIL_TAKEN",
  "TOKEN_INVALID",
  "TOKEN_EXPIRED",
  "REFRESH_REVOKED",

  // Validation / generic
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "CONFLICT",
  "INTERNAL_ERROR",
  "RATE_LIMITED",

  // Session
  "SESSION_NOT_FOUND",
  "SESSION_CLOSED",

  // Turn / audio (SP-3)
  "AUDIO_MISSING",
  "AUDIO_TOO_LARGE",
  "AUDIO_UNSUPPORTED_MIME",
  "AUDIO_INVALID",
  "TURN_TIMEOUT",
  "PROVIDER_UNAVAILABLE",
]);

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** Known error code string constants (for server throws / client switches). */
export const ErrorCodes = ErrorCodeSchema.enum;
