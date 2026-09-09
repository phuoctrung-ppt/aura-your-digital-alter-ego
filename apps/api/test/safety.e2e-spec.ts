/**
 * E2E — safety switch → safe-listener (T-M12-01 / M10).
 *
 * Reuses crisis-phrases fixtures via FAKE_STT_TRANSCRIPT.
 * NEVER print crisis phrase bodies or transcripts in CI logs / assertion messages.
 */

import { randomUUID } from "node:crypto";
import request from "supertest";
import { CRISIS_PHRASES_VI } from "../src/safety/fixtures/crisis-phrases";
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

type TurnData = {
  turnId: string;
  assistantText: string;
  provider: { stt: string; chat: string; tts: string };
  safetyMode: string;
  safetyResources?: Array<{ title: string; value: string; kind: string }>;
};

describe("Safety switch (e2e)", () => {
  let ctx: TestAppContext;
  let wavPath: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    wavPath = writeSilentWavFixture("safety-silence.wav");
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  beforeEach(async () => {
    await truncateUserScopedData(ctx.prisma);
    // Opaque fixture index — do not log the phrase body.
    process.env.FAKE_STT_TRANSCRIPT = CRISIS_PHRASES_VI[0];
  });

  afterEach(() => {
    delete process.env.FAKE_STT_TRANSCRIPT;
  });

  async function createSession(accessToken: string): Promise<string> {
    const res = await request(ctx.httpServer)
      .post("/v1/sessions")
      .set(authHeader(accessToken))
      .send({ personaSlug: "tough-interviewer", locale: "vi" })
      .expect(201);
    return expectOkEnvelope<{ id: string }>(res.body).id;
  }

  it("crisis fixture engages safe-listener + resources + SafetyEvent", async () => {
    const user = await registerFreshUser(ctx.app, "safe");
    const sessionId = await createSession(user.accessToken);

    const res = await request(ctx.httpServer)
      .post(`/v1/sessions/${sessionId}/turns`)
      .set(authHeader(user.accessToken))
      .field("clientTurnId", randomUUID())
      .attach("audio", wavPath, {
        filename: "silence.wav",
        contentType: "audio/wav",
      })
      .expect(200);

    const data = expectOkEnvelope<TurnData>(res.body);
    expect(data.safetyMode).toBe("safe-listener");
    expect(Array.isArray(data.safetyResources)).toBe(true);
    expect((data.safetyResources ?? []).length).toBeGreaterThan(0);
    expect(data.provider.chat).toBe("safe-listener");
    // Persona pressure reply must not be used — safe-listener reply is non-empty.
    expect(data.assistantText.length).toBeGreaterThan(0);
    // Fake chat greeting must NOT appear when safe-listener engages.
    expect(data.assistantText.includes("phản hồi giả lập")).toBe(false);

    const events = await ctx.prisma.safetyEvent.findMany({
      where: { userId: user.userId, sessionId },
      select: { id: true, actionTaken: true, category: true },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]?.actionTaken).toBe("safe-listener");
  });

  it("idempotent replay keeps safetyMode + safetyResources", async () => {
    const user = await registerFreshUser(ctx.app, "safe-idemp");
    const sessionId = await createSession(user.accessToken);
    const clientTurnId = randomUUID();

    const first = await request(ctx.httpServer)
      .post(`/v1/sessions/${sessionId}/turns`)
      .set(authHeader(user.accessToken))
      .field("clientTurnId", clientTurnId)
      .attach("audio", wavPath, {
        filename: "silence.wav",
        contentType: "audio/wav",
      })
      .expect(200);
    const a = expectOkEnvelope<TurnData>(first.body);

    const second = await request(ctx.httpServer)
      .post(`/v1/sessions/${sessionId}/turns`)
      .set(authHeader(user.accessToken))
      .field("clientTurnId", clientTurnId)
      .attach("audio", wavPath, {
        filename: "silence.wav",
        contentType: "audio/wav",
      })
      .expect(200);
    const b = expectOkEnvelope<TurnData>(second.body);

    expect(b.turnId).toBe(a.turnId);
    expect(b.safetyMode).toBe("safe-listener");
    expect((b.safetyResources ?? []).length).toBeGreaterThan(0);
    expect(b.provider.chat).toBe("safe-listener");
  });
});
