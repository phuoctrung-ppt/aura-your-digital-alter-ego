/**
 * Unit — SessionsService locale membership + TTS voice resolve (M15 / T7).
 *
 * Seeds are bilingual; LOCALE_UNSUPPORTED is covered here with a mocked
 * persona row limited to `["vi"]` while input locale is `en`.
 */

import { BadRequestException } from "@nestjs/common";
import { ErrorCodes } from "@aura/contracts";
import { SessionsService } from "./sessions.service";

describe("SessionsService (unit)", () => {
  const prisma = {
    persona: {
      findUnique: jest.fn(),
    },
    session: {
      create: jest.fn(),
    },
  };

  const service = new SessionsService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects locale not in persona.supportedLanguages with LOCALE_UNSUPPORTED", async () => {
    prisma.persona.findUnique.mockResolvedValue({
      id: "persona-vi-only",
      slug: "tough-interviewer",
      supportedLanguages: ["vi"],
    });

    let caught: unknown;
    try {
      await service.create("user-1", {
        personaSlug: "tough-interviewer",
        locale: "en",
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(BadRequestException);
    const body = (caught as BadRequestException).getResponse() as {
      code: string;
      message: string;
      details: {
        field: string;
        reason: string;
        supportedLanguages: string[];
      };
    };
    expect(body.code).toBe(ErrorCodes.VALIDATION_ERROR);
    expect(body.details.reason).toBe("LOCALE_UNSUPPORTED");
    expect(body.details.field).toBe("locale");
    expect(body.details.supportedLanguages).toEqual(["vi"]);
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it("resolveTtsVoiceId returns providerVoiceId for session locale", () => {
    const voiceByLocale = {
      vi: { gender: "male", providerVoiceId: "vi-VN-Neural2-D" },
      en: { gender: "male", providerVoiceId: "en-US-Neural2-D" },
    };

    expect(
      service.resolveTtsVoiceId(voiceByLocale, "vi", "tough-interviewer"),
    ).toBe("vi-VN-Neural2-D");
    expect(
      service.resolveTtsVoiceId(voiceByLocale, "en", "tough-interviewer"),
    ).toBe("en-US-Neural2-D");
  });

  it("resolveTtsVoiceId returns undefined when locale key missing", () => {
    const voiceByLocale = {
      vi: { gender: "female", providerVoiceId: "vi-VN-Neural2-A" },
    };

    expect(
      service.resolveTtsVoiceId(voiceByLocale, "en", "native-buddy"),
    ).toBeUndefined();
  });
});
