/**
 * E2E — session ownership / cross-user isolation (T-M12-01) + M15 locale (T7).
 */

import request from "supertest";
import {
  authHeader,
  closeTestApp,
  createTestApp,
  expectErrorEnvelope,
  expectOkEnvelope,
  registerFreshUser,
  truncateUserScopedData,
  type TestAppContext,
} from "./helpers";

describe("Sessions API (e2e)", () => {
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

  it("creates a session for tough-interviewer (201)", async () => {
    const user = await registerFreshUser(ctx.app, "sess-a");
    const res = await request(ctx.httpServer)
      .post("/v1/sessions")
      .set(authHeader(user.accessToken))
      .send({ personaSlug: "tough-interviewer", locale: "vi" })
      .expect(201);

    const data = expectOkEnvelope<{
      id: string;
      personaSlug: string;
      userId: string;
      locale: string;
    }>(res.body);
    expect(data.personaSlug).toBe("tough-interviewer");
    expect(data.userId).toBe(user.userId);
    expect(data.locale).toBe("vi");
  });

  it("defaults omitted locale to vi", async () => {
    const user = await registerFreshUser(ctx.app, "sess-default-locale");
    const res = await request(ctx.httpServer)
      .post("/v1/sessions")
      .set(authHeader(user.accessToken))
      .send({ personaSlug: "native-buddy" })
      .expect(201);

    const data = expectOkEnvelope<{ locale: string; personaSlug: string }>(
      res.body,
    );
    expect(data.personaSlug).toBe("native-buddy");
    expect(data.locale).toBe("vi");
  });

  it("creates a session with locale=en when persona supports it", async () => {
    const user = await registerFreshUser(ctx.app, "sess-en");
    const res = await request(ctx.httpServer)
      .post("/v1/sessions")
      .set(authHeader(user.accessToken))
      .send({ personaSlug: "tough-interviewer", locale: "en" })
      .expect(201);

    const data = expectOkEnvelope<{ locale: string }>(res.body);
    expect(data.locale).toBe("en");
  });

  it("rejects invalid locale at Zod with VALIDATION_ERROR", async () => {
    const user = await registerFreshUser(ctx.app, "sess-bad-locale");
    const res = await request(ctx.httpServer)
      .post("/v1/sessions")
      .set(authHeader(user.accessToken))
      .send({ personaSlug: "tough-interviewer", locale: "fr" })
      .expect(400);

    const error = expectErrorEnvelope(res.body, "VALIDATION_ERROR");
    // Wire schema only allows vi|en — LOCALE_UNSUPPORTED is service-level
    // (covered in sessions.service.spec.ts with a vi-only mocked persona).
    expect(error.details).toBeDefined();
  });

  it("returns SESSION_NOT_FOUND when user B GETs user A session", async () => {
    const userA = await registerFreshUser(ctx.app, "sess-owner");
    const userB = await registerFreshUser(ctx.app, "sess-other");

    const created = await request(ctx.httpServer)
      .post("/v1/sessions")
      .set(authHeader(userA.accessToken))
      .send({ personaSlug: "tough-interviewer" })
      .expect(201);
    const session = expectOkEnvelope<{ id: string }>(created.body);

    const res = await request(ctx.httpServer)
      .get(`/v1/sessions/${session.id}`)
      .set(authHeader(userB.accessToken))
      .expect(404);

    expectErrorEnvelope(res.body, "SESSION_NOT_FOUND");
  });

  it("returns SESSION_NOT_FOUND when user B ends user A session", async () => {
    const userA = await registerFreshUser(ctx.app, "sess-end-a");
    const userB = await registerFreshUser(ctx.app, "sess-end-b");

    const created = await request(ctx.httpServer)
      .post("/v1/sessions")
      .set(authHeader(userA.accessToken))
      .send({ personaSlug: "native-buddy" })
      .expect(201);
    const session = expectOkEnvelope<{ id: string }>(created.body);

    const res = await request(ctx.httpServer)
      .post(`/v1/sessions/${session.id}/end`)
      .set(authHeader(userB.accessToken))
      .send({})
      .expect(404);

    expectErrorEnvelope(res.body, "SESSION_NOT_FOUND");
  });
});
