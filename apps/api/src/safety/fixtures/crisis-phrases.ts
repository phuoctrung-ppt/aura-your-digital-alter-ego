/**
 * Sample crisis phrases for unit/smoke tests only.
 * Must match `SELF_HARM_PATTERNS` in `safety.service.ts`.
 *
 * NEVER log these strings on production request paths.
 * Prefer opaque labels (e.g. fixtureId) in test output.
 */

/** Short VN+EN samples that hit self-harm heuristics. */
export const CRISIS_PHRASES_VI: readonly string[] = [
  "Tôi muốn tự sát",
  "Tôi muốn chết",
  "Tôi không muốn sống nữa",
] as const;

export const CRISIS_PHRASES_EN: readonly string[] = [
  "I want to kill myself",
  "I want to die",
  "I am suicidal",
] as const;

export const CRISIS_PHRASES: readonly string[] = [
  ...CRISIS_PHRASES_VI,
  ...CRISIS_PHRASES_EN,
] as const;

/**
 * Recommended smoke transcript (VN) — matches `/tự\s*sát/i`.
 * Wire via `FAKE_STT_TRANSCRIPT` in `scripts/smoke-m10.sh`.
 */
export const SMOKE_CRISIS_TRANSCRIPT = CRISIS_PHRASES_VI[0];
