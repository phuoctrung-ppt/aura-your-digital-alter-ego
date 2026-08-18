import { z } from "zod";
import {
  CursorPageMetaSchema,
  CursorPaginationQuerySchema,
  IsoDateTimeSchema,
  LocaleSchema,
  PersonaSlugSchema,
  SessionStatusSchema,
  UuidSchema,
} from "./common.js";
import { successEnvelopeSchema } from "./envelope.js";

export const SessionSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  personaSlug: PersonaSlugSchema,
  status: SessionStatusSchema,
  locale: LocaleSchema,
  startedAt: IsoDateTimeSchema,
  endedAt: IsoDateTimeSchema.nullable(),
});

export type Session = z.infer<typeof SessionSchema>;

// ── Create ────────────────────────────────────────────────────────────────

export const CreateSessionRequestSchema = z.object({
  personaSlug: PersonaSlugSchema,
  /** Session locale; default `vi`. */
  locale: LocaleSchema.optional(),
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
