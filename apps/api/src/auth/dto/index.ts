/**
 * Auth DTO surface — prefer Zod schemas from `@aura/contracts` + ZodValidationPipe.
 * Thin re-exports so controllers/services can import from a local barrel if desired.
 */
export {
  RegisterRequestSchema,
  LoginRequestSchema,
  RefreshRequestSchema,
  LogoutRequestSchema,
  type RegisterRequest,
  type LoginRequest,
  type RefreshRequest,
  type LogoutRequest,
  type RegisterResponseData,
  type LoginResponseData,
  type RefreshResponseData,
  type LogoutResponseData,
  type AuthTokens,
  type User,
} from "@aura/contracts";
