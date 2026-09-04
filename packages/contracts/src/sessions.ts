import { z } from "zod";
import {
  CursorPageMetaSchema,
  CursorPaginationQuerySchema,
  IsoDateTimeSchema,
  PersonaSlugSchema,
  SessionReplyLocaleSchema,
  SessionStatusSchema,
  UuidSchema,
} from "./common.js";
import { successEnvelopeSchema } from "./envelope.js";

export const SessionSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  personaSlug: PersonaSlugSchema,
  status: SessionStatusSchema,
  /**
   * Session reply locale (`vi` | `en`). Always one of the persona's
   * `supportedLanguages` after create validation (M15).
   */
  locale: SessionReplyLocaleSchema,
  startedAt: IsoDateTimeSchema,
  endedAt: IsoDateTimeSchema.nullable(),
  /**
   * Optional for History `row_meta` `{turns}` (M9).
   * TODO(contract-agent / backend-worker): populate on list responses when ready;
   * keep optional so existing create/get/end consumers stay non-breaking.
   */
  turnCount: z.number().int().nonnegative().optional(),
});

export type Session = z.infer<typeof SessionSchema>;

// ── Create ────────────────────────────────────────────────────────────────

/**
 * Create open session.
 *
 * - `locale` optional; default `vi` (`DEFAULT_LOCALE`).
 * - Wire schema allows `vi` | `en` only (`SessionReplyLocaleSchema`).
 * - **Server must also** reject when `locale ∉ persona.supportedLanguages`
 *   with `VALIDATION_ERROR` (details may name the unsupported locale).
 *   Zod alone cannot see the persona catalog — do not rely on this schema
 *   for membership checks.
 * - Mid-call language switch is out of scope (M15).
 */
export const CreateSessionRequestSchema = z.object({
  personaSlug: PersonaSlugSchema,
  /**
   * Session reply locale; default `vi`.
   * Must be ∈ selected persona `supportedLanguages` (server-enforced).
   */
  locale: SessionReplyLocaleSchema.optional(),
});

export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

export const CreateSessionResponseSchema = successEnvelopeSchema(SessionSchema);
export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;

// ── List ──────────────────────────────────────────────────────────────────

export const SessionListQuerySchema = CursorPaginationQuerySchema.extend({
  /** Optional filter by persona. */
  persona: PersonaSlugSchema.optional(),
  status: SessionStatusSchema.optional(),
});

export type SessionListQuery = z.infer<typeof SessionListQuerySchema>;

export const SessionListDataSchema = CursorPageMetaSchema.extend({
  items: z.array(SessionSchema),
});

export type SessionListData = z.infer<typeof SessionListDataSchema>;
export const SessionListResponseSchema = successEnvelopeSchema(SessionListDataSchema);
export type SessionListResponse = z.infer<typeof SessionListResponseSchema>;

// ── Get / End ─────────────────────────────────────────────────────────────

export const GetSessionResponseSchema = successEnvelopeSchema(SessionSchema);
export type GetSessionResponse = z.infer<typeof GetSessionResponseSchema>;

/** POST /v1/sessions/:id/end — no body required. */
export const EndSessionRequestSchema = z.object({}).strict();
export type EndSessionRequest = z.infer<typeof EndSessionRequestSchema>;

export const EndSessionResponseSchema = successEnvelopeSchema(SessionSchema);
export type EndSessionResponse = z.infer<typeof EndSessionResponseSchema>;
