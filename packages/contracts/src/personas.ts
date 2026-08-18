import { z } from "zod";
import { PersonaSlugSchema } from "./common.js";
import { successEnvelopeSchema } from "./envelope.js";

/**
 * Global persona catalog item (not user-scoped).
 * Client sends `personaSlug` only; system prompts stay server-side.
 */
export const PersonaSchema = z.object({
  slug: PersonaSlugSchema,
  /** Display name (VN product strings). */
  name: z.string().min(1),
  /** Short card description. */
  description: z.string().min(1),
  /** Group label for future expansion; MVP: interview | language. */
  group: z.enum(["interview", "language"]),
  /** Key into mobile/asset pack for 3D character. */
  avatarAssetKey: z.string().min(1),
  /** Server prompt version for observability (opaque). */
  systemPromptVersion: z.string().min(1),
});

export type Persona = z.infer<typeof PersonaSchema>;

export const PersonaListDataSchema = z.object({
  items: z.array(PersonaSchema).length(2),
});

export type PersonaListData = z.infer<typeof PersonaListDataSchema>;
export const PersonaListResponseSchema = successEnvelopeSchema(PersonaListDataSchema);
export type PersonaListResponse = z.infer<typeof PersonaListResponseSchema>;
