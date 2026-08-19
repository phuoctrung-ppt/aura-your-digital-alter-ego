/**
 * Sessions DTO surface — Zod schemas from `@aura/contracts` + ZodValidationPipe.
 * Thin re-exports so controllers/services can import from a local barrel if desired.
 */
export {
  SessionSchema,
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  SessionListQuerySchema,
  SessionListDataSchema,
  SessionListResponseSchema,
  GetSessionResponseSchema,
  EndSessionRequestSchema,
  EndSessionResponseSchema,
  type Session,
  type CreateSessionRequest,
  type CreateSessionResponse,
  type SessionListQuery,
  type SessionListData,
  type SessionListResponse,
  type GetSessionResponse,
  type EndSessionRequest,
  type EndSessionResponse,
} from "@aura/contracts";
