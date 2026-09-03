import { z } from "zod";
import { PersonaLanguageSchema, PersonaSlugSchema } from "./common.js";
import { successEnvelopeSchema } from "./envelope.js";

/**
 * Public persona tone knobs (M15). Locked enums — not free-form JSON on the wire.
 * `corrections` is fixed to in-flow for MVP (no post-call report).
 */
export const PersonaToneSchema = z.object({
  style: z.enum(["warm", "tough", "friendly"]),
  pressure: z.enum(["low", "medium", "high"]),
  corrections: z.enum(["in-flow"]),
});
export type PersonaTone = z.infer<typeof PersonaToneSchema>;

/**
 * Per-locale TTS voice binding. Orchestrator passes `providerVoiceId` into
 * `TtsRequest.voice` for the session reply locale.
 */
export const PersonaVoiceSchema = z.object({
  gender: z.enum(["female", "male", "neutral"]),
  providerVoiceId: z.string().min(1),
});
export type PersonaVoice = z.infer<typeof PersonaVoiceSchema>;

export const PersonaVoiceByLocaleSchema = z.record(
  PersonaLanguageSchema,
  PersonaVoiceSchema,
);
export type PersonaVoiceByLocale = z.infer<typeof PersonaVoiceByLocaleSchema>;

/**
 * Global persona catalog item (not user-scoped).
 * Client sends `personaSlug` only; system prompts stay server-side.
 *
 * **Never** expose `systemPromptText` on this public schema.
 */
export const PersonaSchema = z
  .object({
    slug: PersonaSlugSchema,
    /** Display name (VN product strings). */
    name: z.string().min(1),
    /** Short card description. */
    description: z.string().min(1),
    /** Group label for future expansion; MVP: interview | language. */
    group: z.enum(["interview", "language"]),
    /**
     * Key into mobile asset pack for **2D calling-UI** circle avatar
     * (PNG / initials map) — not a 3D/GLB mesh key (ADR-0006).
     */
    avatarAssetKey: z.string().min(1),
    /** Server prompt version for observability (opaque). */
    systemPromptVersion: z.string().min(1),
    /** Public tone object — required on catalog responses (M15). */
    tone: PersonaToneSchema,
    /**
     * Languages this persona can reply in. MVP seeds are bilingual `["vi","en"]`.
     * Session create `locale` must be ∈ this array (server-enforced).
     */
    supportedLanguages: z
      .array(PersonaLanguageSchema)
      .min(1)
      .refine((langs) => new Set(langs).size === langs.length, {
        message: "supportedLanguages must be unique",
      }),
    /**
     * TTS voice per reply language. Keys must equal `supportedLanguages`
     * (no missing / no extra) — enforced by refine below.
     */
    voiceByLocale: PersonaVoiceByLocaleSchema,
  })
  .superRefine((persona, ctx) => {
    const supported = new Set(persona.supportedLanguages);
    const voiceKeys = Object.keys(persona.voiceByLocale) as Array<
      z.infer<typeof PersonaLanguageSchema>
    >;

    for (const key of voiceKeys) {
      if (!supported.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `voiceByLocale key "${key}" is not in supportedLanguages`,
          path: ["voiceByLocale", key],
        });
      }
    }

    for (const lang of persona.supportedLanguages) {
      if (!(lang in persona.voiceByLocale)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `supportedLanguages entry "${lang}" missing from voiceByLocale`,
          path: ["voiceByLocale", lang],
        });
      }
    }
  });

export type Persona = z.infer<typeof PersonaSchema>;

export const PersonaListDataSchema = z.object({
  items: z.array(PersonaSchema).length(2),
});

export type PersonaListData = z.infer<typeof PersonaListDataSchema>;
export const PersonaListResponseSchema = successEnvelopeSchema(PersonaListDataSchema);
export type PersonaListResponse = z.infer<typeof PersonaListResponseSchema>;
