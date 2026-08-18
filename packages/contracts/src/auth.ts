import { z } from "zod";
import { EmailSchema, IsoDateTimeSchema, LocaleSchema, PasswordSchema, UuidSchema } from "./common.js";
import { successEnvelopeSchema } from "./envelope.js";

/** Public user projection (never includes password hash). */
export const UserSchema = z.object({
  id: UuidSchema,
  email: EmailSchema,
  locale: LocaleSchema,
  createdAt: IsoDateTimeSchema,
});

export type User = z.infer<typeof UserSchema>;

export const AuthTokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  /** Access token TTL hint in seconds (optional for clients). */
  expiresIn: z.number().int().positive().optional(),
  tokenType: z.literal("Bearer").default("Bearer"),
});

export type AuthTokens = z.infer<typeof AuthTokensSchema>;

// ── Register ──────────────────────────────────────────────────────────────

export const RegisterRequestSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  /** Default `vi` when omitted. */
  locale: LocaleSchema.optional(),
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const RegisterResponseDataSchema = z.object({
  user: UserSchema,
  tokens: AuthTokensSchema,
});

export type RegisterResponseData = z.infer<typeof RegisterResponseDataSchema>;
export const RegisterResponseSchema = successEnvelopeSchema(RegisterResponseDataSchema);
export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;

// ── Login ─────────────────────────────────────────────────────────────────

export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(128),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseDataSchema = RegisterResponseDataSchema;
export type LoginResponseData = z.infer<typeof LoginResponseDataSchema>;
export const LoginResponseSchema = successEnvelopeSchema(LoginResponseDataSchema);
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// ── Refresh ───────────────────────────────────────────────────────────────

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const RefreshResponseDataSchema = z.object({
  tokens: AuthTokensSchema,
});

export type RefreshResponseData = z.infer<typeof RefreshResponseDataSchema>;
export const RefreshResponseSchema = successEnvelopeSchema(RefreshResponseDataSchema);
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

// ── Logout ────────────────────────────────────────────────────────────────

export const LogoutRequestSchema = z.object({
  /** When provided, revoke this refresh token; otherwise revoke all for user (policy). */
  refreshToken: z.string().min(1).optional(),
});

export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;

export const LogoutResponseDataSchema = z.object({
  ok: z.literal(true),
});

export type LogoutResponseData = z.infer<typeof LogoutResponseDataSchema>;
export const LogoutResponseSchema = successEnvelopeSchema(LogoutResponseDataSchema);
export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;
