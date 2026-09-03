/**
 * E2E — history hard-delete cascade (T-M12-01 / M9).
 * Do not log emails / transcripts.
 */

import request from "supertest";
import {
  authHeader,
  closeTestApp,
  createTestApp,
  expectOkEnvelope,
  registerFreshUser,
  truncateUserScopedData,
  writeSilentWavFixture,
  type TestAppContext,
} from "./helpers";

describe("History wipe (e2e)", () => {
  let ctx: TestAppContext;
  let wavPath: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    wavPath = writeSilentWavFixture("history-silence.wav");
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  beforeEach(async () => {
    await truncateUserScopedData(ctx.prisma);
    delete process.env.FAKE_STT_TRANSCRIPT;
  });

  it("wipe cascade clears user history; User remains", async () => {
    const user = await registerFreshUser(ctx.app, "hist");

    const s1 = await request(ctx.httpServer)
      .post("/v1/sessions")
      .set(authHeader(user.accessToken))
      .send({ personaSlug: "tough-interviewer" })
      .expect(201);
    const session1 = expectOkEnvelope<{ id: string }>(s1.body);

    await request(ctx.httpServer)
      .post("/v1/sessions")
      .set(authHeader(user.accessToken))
      .send({ personaSlug: "native-buddy" })
      .expect(201);

    await request(ctx.httpServer)
      .post(`/v1/sessions/${session1.id}/turns`)
      .set(authHeader(user.accessToken))
      .attach("audio", wavPath, {
        filename: "silence.wav",
        contentType: "audio/wav",
      })
      .expect(200);

    const wipe = await request(ctx.httpServer)
      .delete("/v1/me/history")
      .set(authHeader(user.accessToken))
      .expect(200);

    const counts = expectOkEnvelope<{
      ok: true;
      deletedSessions: number;
      deletedTurns: number;
      deletedMemoryItems: number;
    }>(wipe.body);

    expect(counts.ok).toBe(true);
    expect(counts.deletedSessions).toBeGreaterThanOrEqual(2);
    expect(counts.deletedTurns).toBeGreaterThanOrEqual(1);

    const sessionsLeft = await ctx.prisma.session.count({
      where: { userId: user.userId },
    });
    expect(sessionsLeft).toBe(0);

    const userRow = await ctx.prisma.user.findUnique({
      where: { id: user.userId },
      select: { id: true },
    });
    expect(userRow?.id).toBe(user.userId);
  });

  it("post-wipe list empty; create session still works", async () => {
    const user = await registerFreshUser(ctx.app, "hist-post");

    await request(ctx.httpServer)
      .post("/v1/sessions")
      .set(authHeader(user.accessToken))
      .send({ personaSlug: "tough-interviewer" })
      .expect(201);

    await request(ctx.httpServer)
      .delete("/v1/me/history")
      .set(authHeader(user.accessToken))
      .expect(200);

    const list = await request(ctx.httpServer)
      .get("/v1/sessions")
      .set(authHeader(user.accessToken))
      .expect(200);
    const listData = expectOkEnvelope<{ items: unknown[] }>(list.body);
    expect(listData.items.length).toBe(0);

    const created = await request(ctx.httpServer)
      .post("/v1/sessions")
      .set(authHeader(user.accessToken))
      .send({ personaSlug: "native-buddy" })
      .expect(201);
    const session = expectOkEnvelope<{ id: string }>(created.body);
    expect(session.id).toBeTruthy();
  });
});
