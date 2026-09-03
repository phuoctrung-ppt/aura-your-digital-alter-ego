/**
 * E2E — voice turn orchestrator under AI_PROVIDER_MODE=fake (T-M12-01 / M15 T7).
 * Never log transcripts / audio paths.
 */

import { randomUUID } from "node:crypto";
import request from "supertest";
import { FakeTtsProvider } from "../src/ai/providers/fake-tts.provider";
import type { TtsRequest } from "../src/ai/interfaces/tts-provider";
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
  sessionId: string;
  clientTurnId: string | null;
  userTranscript: string;
  assistantText: string;
  audioUrl: string;
  provider: { stt: string; chat: string; tts: string };
  safetyMode: string;
};

/** Seeded tough-interviewer voiceByLocale.providerVoiceId values (prisma/seed.ts). */
const TOUGH_INTERVIEWER_VOICE = {
  vi: "vi-VN-Neural2-D",
  en: "en-US-Neural2-D",
} as const;

describe("Turns orchestrator (e2e)", () => {
  let ctx: TestAppContext;
  let wavPath: string;
  let synthesizeSpy: jest.SpyInstance;

  beforeAll(async () => {
    ctx = await createTestApp();
    wavPath = writeSilentWavFixture("turns-silence.wav");
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  beforeEach(async () => {
    await truncateUserScopedData(ctx.prisma);
    delete process.env.FAKE_STT_TRANSCRIPT;
    const fakeTts = ctx.app.get(FakeTtsProvider);
    synthesizeSpy = jest.spyOn(fakeTts, "synthesize");
  });

  afterEach(() => {
    synthesizeSpy?.mockRestore();
  });

  async function createSession(
    accessToken: string,
    locale: "vi" | "en" = "vi",
  ): Promise<string> {
    const res = await request(ctx.httpServer)
      .post("/v1/sessions")
      .set(authHeader(accessToken))
      .send({ personaSlug: "tough-interviewer", locale })
      .expect(201);
    return expectOkEnvelope<{ id: string }>(res.body).id;
  }

  function lastSynthesizeVoice(): string | undefined {
    expect(synthesizeSpy).toHaveBeenCalled();
    const req = synthesizeSpy.mock.calls.at(-1)?.[0] as TtsRequest | undefined;
    return req?.voice;
  }

  it("multipart fake turn returns assistant + providers + normal safety", async () => {
    const user = await registerFreshUser(ctx.app, "turn");
    const sessionId = await createSession(user.accessToken);
    const clientTurnId = randomUUID();

    const res = await request(ctx.httpServer)
      .post(`/v1/sessions/${sessionId}/turns`)
      .set(authHeader(user.accessToken))
      .field("clientLocale", "vi")
      .field("clientTurnId", clientTurnId)
      .field("clientDurationMs", "1000")
      .attach("audio", wavPath, {
        filename: "silence.wav",
        contentType: "audio/wav",
      })
      .expect(200);

    const data = expectOkEnvelope<TurnData>(res.body);
    expect(data.sessionId).toBe(sessionId);
    expect(data.turnId).toBeTruthy();
    expect(typeof data.userTranscript).toBe("string");
    expect(data.userTranscript.length).toBeGreaterThan(0);
    expect(typeof data.assistantText).toBe("string");
    expect(data.assistantText.length).toBeGreaterThan(0);
    expect(data.audioUrl).toMatch(
      new RegExp(`^/v1/sessions/${sessionId}/turns/.+/audio$`),
    );
    expect(data.provider.stt).toBe("fake-stt");
    expect(data.provider.chat).toBe("fake-chat");
    expect(data.provider.tts).toMatch(/fake/);
    expect(data.safetyMode).toBe("normal");
    expect(data.clientTurnId).toBe(clientTurnId);
  });

  it("idempotent replay with same clientTurnId returns same turnId", async () => {
    const user = await registerFreshUser(ctx.app, "turn-idemp");
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
    expect(b.clientTurnId).toBe(clientTurnId);
  });

  it("GET audioUrl returns 200 with bytes", async () => {
    const user = await registerFreshUser(ctx.app, "turn-audio");
    const sessionId = await createSession(user.accessToken);

    const turnRes = await request(ctx.httpServer)
      .post(`/v1/sessions/${sessionId}/turns`)
      .set(authHeader(user.accessToken))
      .attach("audio", wavPath, {
        filename: "silence.wav",
        contentType: "audio/wav",
      })
      .expect(200);
    const turn = expectOkEnvelope<TurnData>(turnRes.body);

    const audioRes = await request(ctx.httpServer)
      .get(turn.audioUrl)
      .set(authHeader(user.accessToken))
      .expect(200);

    expect(Buffer.isBuffer(audioRes.body) || typeof audioRes.body === "string").toBe(
      true,
    );
    const len =
      typeof audioRes.body === "string"
        ? Buffer.byteLength(audioRes.body)
        : (audioRes.body as Buffer).length;
    expect(len).toBeGreaterThan(0);
  });

  it("GET /v1/memory after a turn returns 200 envelope", async () => {
    const user = await registerFreshUser(ctx.app, "turn-mem");
    const sessionId = await createSession(user.accessToken);

    await request(ctx.httpServer)
      .post(`/v1/sessions/${sessionId}/turns`)
      .set(authHeader(user.accessToken))
      .attach("audio", wavPath, {
        filename: "silence.wav",
        contentType: "audio/wav",
      })
      .expect(200);

    const mem = await request(ctx.httpServer)
      .get("/v1/memory")
      .set(authHeader(user.accessToken))
      .expect(200);

    expectOkEnvelope(mem.body);
  });

  it("passes persona voiceByLocale[vi] into FakeTts synthesize", async () => {
    const user = await registerFreshUser(ctx.app, "turn-voice-vi");
    const sessionId = await createSession(user.accessToken, "vi");

    await request(ctx.httpServer)
      .post(`/v1/sessions/${sessionId}/turns`)
      .set(authHeader(user.accessToken))
      .field("clientLocale", "vi")
      .attach("audio", wavPath, {
        filename: "silence.wav",
        contentType: "audio/wav",
      })
      .expect(200);

    expect(lastSynthesizeVoice()).toBe(TOUGH_INTERVIEWER_VOICE.vi);
  });

  it("passes persona voiceByLocale[en] into FakeTts synthesize", async () => {
    const user = await registerFreshUser(ctx.app, "turn-voice-en");
    const sessionId = await createSession(user.accessToken, "en");

    await request(ctx.httpServer)
      .post(`/v1/sessions/${sessionId}/turns`)
      .set(authHeader(user.accessToken))
      .field("clientLocale", "en")
      .attach("audio", wavPath, {
        filename: "silence.wav",
        contentType: "audio/wav",
      })
      .expect(200);

    expect(lastSynthesizeVoice()).toBe(TOUGH_INTERVIEWER_VOICE.en);
  });
});
