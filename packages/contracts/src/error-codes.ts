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

  // Turn / audio (SP-3 REST multipart — also reused on WS when semantics match)
  "AUDIO_MISSING",
  "AUDIO_TOO_LARGE",
  "AUDIO_UNSUPPORTED_MIME",
  "AUDIO_INVALID",
  "TURN_TIMEOUT",
  "PROVIDER_UNAVAILABLE",

  /**
   * WebSocket / Socket.IO voice path (M7.5 / ADR-0005).
   * Prefer reusing UNAUTHORIZED, SESSION_NOT_FOUND, SESSION_CLOSED,
   * RATE_LIMITED, AUDIO_INVALID, AUDIO_TOO_LARGE, TURN_TIMEOUT,
   * PROVIDER_UNAVAILABLE when the failure matches REST semantics.
   * Use the WS_* codes below only when the failure is socket/stream-specific.
   */
  "WS_UNAUTHORIZED",
  "WS_TURN_IN_PROGRESS",
  "WS_TURN_NOT_FOUND",
  "WS_AUDIO_INVALID",
  "WS_STREAM_FAILED",
  "WS_RATE_LIMITED",
]);

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** Known error code string constants (for server throws / client switches). */
export const ErrorCodes = ErrorCodeSchema.enum;
