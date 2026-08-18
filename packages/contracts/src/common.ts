import { z } from "zod";

/** UUID v4 (relaxed: any standard UUID string). */
export const UuidSchema = z.string().uuid();

/** ISO-8601 datetime string. */
export const IsoDateTimeSchema = z.string().datetime({ offset: true });

/**
 * BCP-47 locale. Product default is Vietnamese (`vi`).
 * Accept short tags used by the app; server may normalize.
 */
export const LocaleSchema = z
  .string()
  .min(2)
  .max(35)
  .regex(/^[A-Za-z]{2,3}([_-][A-Za-z0-9]+)*$/, "Invalid locale tag");

export const DEFAULT_LOCALE = "vi" as const;

/** Cursor pagination query params (list endpoints). */
export const CursorPaginationQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CursorPaginationQuery = z.infer<typeof CursorPaginationQuerySchema>;

/** Cursor pagination response fields (embedded in list payloads). */
export const CursorPageMetaSchema = z.object({
  nextCursor: z.string().nullable(),
  limit: z.number().int().positive(),
});

export type CursorPageMeta = z.infer<typeof CursorPageMetaSchema>;

/** MVP persona slugs only (ADR-0004). */
export const PersonaSlugSchema = z.enum(["tough-interviewer", "native-buddy"]);
export type PersonaSlug = z.infer<typeof PersonaSlugSchema>;

export const SessionStatusSchema = z.enum(["open", "ended"]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

/** Avatar state cue for client 3D runtime. */
export const AvatarCueSchema = z.enum(["idle", "listen", "talk"]);
export type AvatarCue = z.infer<typeof AvatarCueSchema>;

/** Safety mode after pre/post checks. */
export const SafetyModeSchema = z.enum(["normal", "safe-listener"]);
export type SafetyMode = z.infer<typeof SafetyModeSchema>;

/** Provider names recorded on a turn (opaque strings; not an exhaustive enum). */
export const ProviderInfoSchema = z.object({
  stt: z.string().min(1),
  chat: z.string().min(1),
  tts: z.string().min(1),
});
export type ProviderInfo = z.infer<typeof ProviderInfoSchema>;

/** Email for auth (normalized lowercase by server; client may send mixed case). */
export const EmailSchema = z.string().email().max(320);

/** Password rules for register/login body validation (server hashes; never log). */
export const PasswordSchema = z.string().min(8).max(128);
