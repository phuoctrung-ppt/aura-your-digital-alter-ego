import {
  LoginResponseSchema,
  LogoutResponseSchema,
  RefreshResponseSchema,
  RegisterResponseSchema,
  UserSchema,
  successEnvelopeSchema,
  type LoginRequest,
  type LoginResponse,
  type LogoutRequest,
  type LogoutResponse,
  type RefreshRequest,
  type RefreshResponse,
  type RegisterRequest,
  type RegisterResponse,
  type User,
} from "@aura/contracts";
import { apiClient, ApiError, type ApiClient } from "./client";

const MeResponseSchema = successEnvelopeSchema(UserSchema);

/**
 * Auth API — paths match docs/contracts/v1-aura.md + GET /v1/me probe.
 * Validates success envelopes with Zod schemas from @aura/contracts.
 */

function parseOrThrow<T>(
  schema: { safeParse: (data: unknown) => { success: true; data: T } | { success: false } },
  raw: unknown,
  label: string,
): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(
      "INTERNAL_ERROR",
      `Invalid ${label} response shape`,
      500,
    );
  }
  return parsed.data;
}

export function createAuthApi(client: ApiClient = apiClient) {
  return {
    async register(body: RegisterRequest): Promise<RegisterResponse> {
      const raw = await client.request<unknown>("/v1/auth/register", {
        method: "POST",
        body: JSON.stringify(body),
      }, { skipAuth: true });
      return parseOrThrow(RegisterResponseSchema, raw, "register");
    },

    async login(body: LoginRequest): Promise<LoginResponse> {
      const raw = await client.request<unknown>("/v1/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      }, { skipAuth: true });
      return parseOrThrow(LoginResponseSchema, raw, "login");
    },

    async refresh(body: RefreshRequest): Promise<RefreshResponse> {
      const raw = await client.request<unknown>(
        "/v1/auth/refresh",
        {
          method: "POST",
          body: JSON.stringify(body),
        },
        { skipAuth: true, skipRefresh: true },
      );
      return parseOrThrow(RefreshResponseSchema, raw, "refresh");
    },

    async logout(body: LogoutRequest = {}): Promise<LogoutResponse> {
      const raw = await client.request<unknown>("/v1/auth/logout", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return parseOrThrow(LogoutResponseSchema, raw, "logout");
    },

    /** GET /v1/me — public user projection. */
    async me(): Promise<User> {
      const raw = await client.request<unknown>("/v1/me", { method: "GET" });
      const envelope = parseOrThrow(MeResponseSchema, raw, "me");
      return envelope.data;
    },
  };
}

export const authApi = createAuthApi();
