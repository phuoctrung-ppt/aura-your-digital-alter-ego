/**
 * Auth helpers for e2e specs — register / login against `/v1/auth/*` (M12).
 *
 * Never print full JWT / refresh tokens in assertions or logs
 * (length / truncated prefix only, matching scripts/smoke-auth.sh).
 */

import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { expectOkEnvelope } from "./http";

export type TestAuthTokens = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
};

export type TestCredentials = {
  email: string;
  password: string;
};

type AuthSuccessData = {
  user: { id: string; email: string };
  tokens: { accessToken: string; refreshToken: string };
};

const DEFAULT_PASSWORD = "SmokeTest1!";

/** POST /v1/auth/register — returns tokens (do not log). */
export async function registerUser(
  app: INestApplication,
  credentials: TestCredentials,
): Promise<TestAuthTokens> {
  const res = await request(app.getHttpServer())
    .post("/v1/auth/register")
    .send({
      email: credentials.email,
      password: credentials.password,
      locale: "vi",
    })
    .expect(201);

  const data = expectOkEnvelope<AuthSuccessData>(res.body);
  expect(typeof data.tokens.accessToken).toBe("string");
  expect(data.tokens.accessToken.length).toBeGreaterThan(10);
  expect(typeof data.user.id).toBe("string");

  return {
    accessToken: data.tokens.accessToken,
    refreshToken: data.tokens.refreshToken,
    userId: data.user.id,
    email: data.user.email,
  };
}

/** POST /v1/auth/login — returns tokens (do not log). */
export async function loginUser(
  app: INestApplication,
  credentials: TestCredentials,
): Promise<TestAuthTokens> {
  const res = await request(app.getHttpServer())
    .post("/v1/auth/login")
    .send({
      email: credentials.email,
      password: credentials.password,
    })
    .expect(200);

  const data = expectOkEnvelope<AuthSuccessData>(res.body);
  return {
    accessToken: data.tokens.accessToken,
    refreshToken: data.tokens.refreshToken,
    userId: data.user.id,
    email: data.user.email,
  };
}

/** Bearer header map for authenticated requests. */
export function authHeader(accessToken: string): { Authorization: string } {
  return { Authorization: `Bearer ${accessToken}` };
}

/** Unique email for test isolation (epoch + random). */
export function uniqueTestEmail(prefix = "m12"): string {
  const nonce = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  return `${prefix}-${nonce}@example.com`;
}

/** Convenience: register a fresh user with default password. */
export async function registerFreshUser(
  app: INestApplication,
  prefix = "m12",
): Promise<TestAuthTokens & { password: string }> {
  const email = uniqueTestEmail(prefix);
  const password = DEFAULT_PASSWORD;
  const tokens = await registerUser(app, { email, password });
  return { ...tokens, password };
}
