/**
 * Global e2e setup for Nest + Prisma integration tests (M12).
 *
 * Loaded via jest.config.ts `setupFilesAfterEnv`.
 * Do not put secrets or real cloud provider credentials here.
 * Never log transcripts / crisis phrase bodies / tokens.
 */

process.env.NODE_ENV = "test";

// Always force fake AI in Jest — never call Ollama / Vertex / GCP from CI.
process.env.AI_PROVIDER_MODE = "fake";
process.env.STT_PROVIDER = process.env.STT_PROVIDER ?? "fake";
process.env.TTS_PROVIDER = process.env.TTS_PROVIDER ?? "fake";

// Force local compose Postgres for Jest. Root `.env` often points at remote
// (e.g. Supabase) and ConfigModule/Prisma CLI may read it — never inherit that
// into critical-path suites unless CI already set DATABASE_URL.
// CI workflow sets DATABASE_URL=localhost:5432 and CI=true.
const localDb =
  process.env.AURA_TEST_DATABASE_URL ??
  "postgresql://aura:aura@localhost:5433/aura";
if (process.env.CI === "true") {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgresql://aura:aura@localhost:5432/aura";
} else {
  process.env.DATABASE_URL = localDb;
}
process.env.DIRECT_URL = process.env.DATABASE_URL;

// Isolated audio dir for tests (fake TTS writes here).
process.env.AUDIO_STORAGE_PATH =
  process.env.AUDIO_STORAGE_PATH ?? "/tmp/aura-audio-jest";

// JWT: AuthSecrets unlocks test-only defaults when NODE_ENV=test and secrets unset.
// Explicit smoke-style secrets keep behavior predictable across local + CI.
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? "smoke-access-secret-do-not-use-prod-32b";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? "smoke-refresh-secret-do-not-use-prod-32b";
