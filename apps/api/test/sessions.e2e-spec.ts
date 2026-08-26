/**
 * E2E — session ownership / cross-user isolation (T-M12-01).
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
    }>(res.body);
    expect(data.personaSlug).toBe("tough-interviewer");
    expect(data.userId).toBe(user.userId);
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
