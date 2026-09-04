import type { Persona } from "@aura/contracts";
import { homeCopy } from "../../lib/i18n";

/**
 * Design Contract VN catalog — used when GET /v1/personas fails / mock mode.
 * Exactly 2 MVP personas; never invent additional slugs.
 * M15: tone / supportedLanguages / voiceByLocale required on Persona.
 */
export const FALLBACK_PERSONAS: readonly Persona[] = [
  {
    slug: "tough-interviewer",
    name: homeCopy.persona.tough_interviewer.name,
    description: homeCopy.persona.tough_interviewer.blurb,
    group: "interview",
    avatarAssetKey: "tough-interviewer",
    systemPromptVersion: "fallback",
    tone: {
      style: "tough",
      pressure: "high",
      corrections: "in-flow",
    },
    supportedLanguages: ["vi", "en"],
    voiceByLocale: {
      vi: { gender: "female", providerVoiceId: "fallback-interviewer-vi" },
      en: { gender: "female", providerVoiceId: "fallback-interviewer-en" },
    },
  },
  {
    slug: "native-buddy",
    name: homeCopy.persona.native_buddy.name,
    description: homeCopy.persona.native_buddy.blurb,
    group: "language",
    avatarAssetKey: "native-buddy",
    systemPromptVersion: "fallback",
    tone: {
      style: "friendly",
      pressure: "low",
      corrections: "in-flow",
    },
    supportedLanguages: ["vi", "en"],
    voiceByLocale: {
      vi: { gender: "neutral", providerVoiceId: "fallback-buddy-vi" },
      en: { gender: "neutral", providerVoiceId: "fallback-buddy-en" },
    },
  },
] as const;

export function onlyMvpPersonas(items: Persona[]): Persona[] {
  const allowed = new Set(["tough-interviewer", "native-buddy"]);
  const filtered = items.filter((p) => allowed.has(p.slug));
  if (filtered.length === 2) {
    return filtered;
  }
  return [...FALLBACK_PERSONAS];
}
