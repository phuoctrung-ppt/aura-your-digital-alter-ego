/**
 * E2E — auth register / login happy + failure paths (T-M12-01).
 * Never log tokens.
 */

import request from "supertest";
import {
  authHeader,
  closeTestApp,
  createTestApp,
  expectErrorEnvelope,
  expectOkEnvelope,
  registerFreshUser,
  registerUser,
  truncateUserScopedData,
  uniqueTestEmail,
  type TestAppContext,
} from "./helpers";

describe("Auth API (e2e)", () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  beforeEach(async () => {
    await truncateUserScopedData(ctx.prisma);
  });

  it("registers a user and returns tokens (201)", async () => {
    const email = uniqueTestEmail("auth-reg");
    const res = await request(ctx.httpServer)
      .post("/v1/auth/register")
      .send({ email, password: "SmokeTest1!", locale: "vi" })
      .expect(201);

    const data = expectOkEnvelope<{
      user: { id: string; email: string };
      tokens: { accessToken: string; refreshToken: string };
    }>(res.body);

    expect(data.user.email).toBe(email.toLowerCase());
    expect(data.tokens.accessToken.length).toBeGreaterThan(10);
    expect(data.tokens.refreshToken.length).toBeGreaterThan(10);
  });

  it("logs in with valid credentials (200)", async () => {
    const email = uniqueTestEmail("auth-login");
    const password = "SmokeTest1!";
    await registerUser(ctx.app, { email, password });

    const res = await request(ctx.httpServer)
      .post("/v1/auth/login")
      .send({ email, password })
      .expect(200);

    const data = expectOkEnvelope<{
      tokens: { accessToken: string };
    }>(res.body);
    expect(data.tokens.accessToken.length).toBeGreaterThan(10);
  });

  it("rejects wrong password with INVALID_CREDENTIALS (no existence leak)", async () => {
    const email = uniqueTestEmail("auth-bad");
    await registerUser(ctx.app, { email, password: "SmokeTest1!" });

    const res = await request(ctx.httpServer)
      .post("/v1/auth/login")
      .send({ email, password: "WrongPass1!" })
      .expect(401);

    expectErrorEnvelope(res.body, "INVALID_CREDENTIALS");
  });

  it("rejects unknown email with INVALID_CREDENTIALS (same code)", async () => {
    const res = await request(ctx.httpServer)
      .post("/v1/auth/login")
      .send({ email: uniqueTestEmail("auth-missing"), password: "SmokeTest1!" })
      .expect(401);

    expectErrorEnvelope(res.body, "INVALID_CREDENTIALS");
  });

  it("GET /v1/me without token returns 401 UNAUTHORIZED", async () => {
    const res = await request(ctx.httpServer).get("/v1/me").expect(401);
    expectErrorEnvelope(res.body, "UNAUTHORIZED");
  });

  it("GET /v1/me with access token returns 200", async () => {
    const user = await registerFreshUser(ctx.app, "auth-me");
    const res = await request(ctx.httpServer)
      .get("/v1/me")
      .set(authHeader(user.accessToken))
      .expect(200);

    const data = expectOkEnvelope<{ id: string; email: string }>(res.body);
    expect(data.id).toBe(user.userId);
  });
});
