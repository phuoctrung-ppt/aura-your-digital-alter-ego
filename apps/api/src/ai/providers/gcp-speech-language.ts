/**
 * Map product locale (`vi`) / BCP-47 tags onto Speech language codes (`vi-VN`).
 * Prefer `GCP_SPEECH_LANGUAGE_CODE` when set; still normalize bare `vi`/`vn`.
 *
 * Aura is VN-first but Tough Interviewer practice is often English while the
 * client still sends `clientLocale: "vi"`. Speech with only `vi-VN` returns
 * empty hypotheses for English utterances — use {@link resolveSpeechAlternativeLanguageCodes}.
 */

const PRODUCT_SPEECH_LANGS = ["vi-VN", "en-US"] as const;

export function resolveSpeechLanguageCode(
  locale: string | undefined,
  envOverride: string | undefined,
): string {
  const fromEnv = envOverride?.trim();
  if (fromEnv) return normalizeSpeechLanguageTag(fromEnv);

  return normalizeSpeechLanguageTag(locale ?? "vi");
}

/**
 * Up to 3 BCP-47 alternatives for Speech `alternativeLanguageCodes`.
 * Always pairs `vi-VN` ↔ `en-US` so mixed interview / buddy turns work when
 * the wire locale is wrong or the user code-switches.
 */
export function resolveSpeechAlternativeLanguageCodes(
  primaryLanguageCode: string,
): string[] {
  const primary = normalizeSpeechLanguageTag(primaryLanguageCode);
  const primaryLower = primary.toLowerCase();
  const primaryBase = primaryLower.split("-")[0] ?? primaryLower;

  const alts: string[] = [];
  for (const candidate of PRODUCT_SPEECH_LANGS) {
    if (candidate.toLowerCase() === primaryLower) continue;
    if (candidate.toLowerCase().split("-")[0] === primaryBase) continue;
    alts.push(candidate);
  }
  // Cap at Speech v1 max (3); we only ever emit one today.
  return alts.slice(0, 3);
}

/**
 * Hybrid / short PTT model order. Always try `latest_short` before
 * `latest_long` — long model on ~5–15s Expo clips was observed to return
 * `resultCount=0` despite healthy PCM (see docs/memory/gotchas.md).
 * `preferred` (from `GCP_SPEECH_STREAM_MODEL`) is kept in the list but never
 * ahead of `latest_short` unless it *is* `latest_short`.
 */
export function resolveHybridSpeechModels(preferred: string | undefined): string[] {
  const raw = preferred?.trim() || "latest_short";
  const ordered: string[] = ["latest_short"];
  if (raw !== "latest_short") ordered.push(raw);
  if (raw !== "latest_long" && !ordered.includes("latest_long")) {
    ordered.push("latest_long");
  }
  return ordered;
}

function normalizeSpeechLanguageTag(rawInput: string): string {
  const raw = rawInput.trim();
  if (!raw) return "vi-VN";
  if (raw.toLowerCase() === "vi" || raw.toLowerCase() === "vn") return "vi-VN";
  // Already region-qualified (vi-VN, en-US, …)
  if (raw.includes("-") || raw.includes("_")) {
    return raw.replace("_", "-");
  }
  return raw;
}
