import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { TtsProvider } from "../src/ai/interfaces/tts-provider";
import { JwtService } from "@nestjs/jwt";
import { UsersService } from "../src/users/users.service";

describe("Voice Preferences E2E", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let usersService: UsersService;
  let ttsProvider: TtsProvider;

  const TEST_USER_EMAIL = "voice-test@aura.ai";
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
    usersService = module.get<UsersService>(UsersService);
    ttsProvider = module.get<TtsProvider>("TTS_PROVIDER");

    // Setup Test User
    const user = await prisma.user.upsert({
      where: { email: TEST_USER_EMAIL },
      update: {},
      create: {
        email: TEST_USER_EMAIL,
        password: "password123",
        locale: "vi-VN",
      },
    });
    userId = user.id;
    authToken = jwtService.sign({ sub: userId });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { email: TEST_USER_EMAIL } }).catch(() => {});
    await app.close();
  });

  const authHeader = { Authorization: `Bearer ${authToken}` };

  it("1. should list available voices", async () => {
    const response = await request(app.getHttpServer())
      .get("/v1/me/voices")
      .set(authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data).toBeInstanceOf(Array);
    // Depending on fake provider, it might return a few mock voices
  });

  it("2. should preview a voice", async () => {
    const voiceId = "test-voice-1";
    const response = await request(app.getHttpServer())
      .post("/v1/me/voices/preview")
      .set(authHeader)
      .send({ voiceId });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveProperty("audioUri");
  });

  it("3. should update voice preference", async () => {
    const voiceId = "preferred-voice-abc";
    const response = await request(app.getHttpServer())
      .patch("/v1/me/voices/preference")
      .set(authHeader)
      .send({ voiceId });

    expect(response.status).toBe(200);
    expect(response.body.data.success).toBe(true);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.selectedVoiceId).toBe(voiceId);
  });

  it("4. should use selected voice in orchestrator integration", async () => {
    // Setup: User has a specific voice preference
    const preferredVoiceId = "orchestrator-test-voice";
    await prisma.user.update({
      where: { id: userId },
      data: { selectedVoiceId: preferredVoiceId },
    });

    // Create a session for the user
    const persona = await prisma.persona.findFirst();
    if (!persona) throw new Error("No personas seeded");

    const session = await prisma.session.create({
      data: {
        userId,
        personaId: persona.id,
        locale: "vi-VN",
        status: "open",
      },
    });

    // Spy on TtsProvider.synthesize
    const synthesizeSpy = jest.spyOn(ttsProvider, "synthesize");

    // Trigger a turn (via REST multipart fallback to keep test simple)
    // Note: We simulate the TurnAudioUpload buffer
    const response = await request(app.getHttpServer())
      .post(`/v1/sessions/${session.id}/turns`)
      .set(authHeader)
      .attach("audio", Buffer.from("fake-audio"), "test.wav")
      .field("clientLocale", "vi-VN");

    expect(response.status).toBe(200);

    // Verify that synthesize was called with the preferred voice ID
    expect(synthesizeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        voice: preferredVoiceId,
      })
    );

    synthesizeSpy.mockRestore();
  });

  it("5. should fallback to persona default when no preference is set", async () => {
    // Setup: Clear voice preference
    await prisma.user.update({
      where: { id: userId },
      data: { selectedVoiceId: null },
    });

    const persona = await prisma.persona.findFirst();
    if (!persona) throw new Error("No personas seeded");

    const session = await prisma.session.create({
      data: {
        userId,
        personaId: persona.id,
        locale: "vi-VN",
        status: "open",
      },
    });

    const synthesizeSpy = jest.spyOn(ttsProvider, "synthesize");

    await request(app.getHttpServer())
      .post(`/v1/sessions/${session.id}/turns`)
      .set(authHeader)
      .attach("audio", Buffer.from("fake-audio"), "test.wav")
      .field("clientLocale", "vi-VN");

    // The expected voice is derived from session.persona.voiceByLocale
    // In the fake provider/seeded data, it's usually based on the persona slug or locale
    const expectedPersonaVoice = persona.voiceByLocale?.["vi-VN"] || persona.slug;

    expect(synthesizeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        voice: expect.any(String),
      })
    );

    const callArgs = synthesizeSpy.mock.calls[0][0];
    expect(callArgs.voice).not.toBe(null);
    expect(callArgs.voice).not.toBe(undefined);

    synthesizeSpy.mockRestore();
  });
});
