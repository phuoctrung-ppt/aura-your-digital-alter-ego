/**
 * E2E — MVP persona catalog shape (M15 / T7).
 * Asserts public PersonaConfig fields and never exposes systemPromptText.
 */

import {
  PersonaListDataSchema,
  PersonaSchema,
  type Persona,
} from "@aura/contracts";
import request from "supertest";
import {
  authHeader,
  closeTestApp,
  createTestApp,
  expectOkEnvelope,
  registerFreshUser,
  truncateUserScopedData,
  type TestAppContext,
} from "./helpers";

describe("Personas API (e2e)", () => {
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

  it("GET /v1/personas returns exactly 2 MVP items with M15 public config", async () => {
    const user = await registerFreshUser(ctx.app, "persona-list");

    const res = await request(ctx.httpServer)
      .get("/v1/personas")
      .set(authHeader(user.accessToken))
      .expect(200);

    const data = expectOkEnvelope<{ items: Persona[] }>(res.body);
    const parsed = PersonaListDataSchema.safeParse(data);
    expect(parsed.success).toBe(true);

    expect(data.items).toHaveLength(2);
    const slugs = data.items.map((p) => p.slug).sort();
    expect(slugs).toEqual(["native-buddy", "tough-interviewer"]);

    for (const item of data.items) {
      const one = PersonaSchema.safeParse(item);
      expect(one.success).toBe(true);

      expect(item.tone).toEqual(
        expect.objectContaining({
          style: expect.any(String),
          pressure: expect.any(String),
          corrections: "in-flow",
        }),
      );
      expect(Array.isArray(item.supportedLanguages)).toBe(true);
      expect(item.supportedLanguages).toEqual(
        expect.arrayContaining(["vi", "en"]),
      );
      expect(item.voiceByLocale).toEqual(
        expect.objectContaining({
          vi: expect.objectContaining({
            providerVoiceId: expect.any(String),
          }),
          en: expect.objectContaining({
            providerVoiceId: expect.any(String),
          }),
        }),
      );

      // Public catalog must never leak server-side prompt text.
      expect(item).not.toHaveProperty("systemPromptText");
      expect(JSON.stringify(item)).not.toMatch(/systemPromptText/);
    }
  });
});
