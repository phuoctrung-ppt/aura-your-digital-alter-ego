/**
 * Personas DTO surface — Zod schemas from `@aura/contracts` + ZodValidationPipe.
 * Thin re-exports so controllers/services can import from a local barrel if desired.
 */
export {
  PersonaSchema,
  PersonaListDataSchema,
  PersonaListResponseSchema,
  type Persona,
  type PersonaListData,
  type PersonaListResponse,
  PersonaSlugSchema,
  type PersonaSlug,
} from "@aura/contracts";
