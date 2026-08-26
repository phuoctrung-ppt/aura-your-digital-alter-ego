/**
 * Jest config for @aura/api (M12).
 *
 * - unit: colocated src *.spec.ts (e.g. SafetyService)
 * - e2e/integration: test *.e2e-spec.ts (real Postgres + AI_PROVIDER_MODE=fake)
 *
 * Legacy tsx self-checks under src/ai/providers stay excluded until converted.
 * Plain JS config avoids a ts-node dependency for loading jest.config.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testRegex: ".*\\.(e2e-spec|spec)\\.ts$",
  moduleFileExtensions: ["ts", "js", "json"],
  transform: {
    "^.+\\.(t|j)s$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/test/tsconfig.e2e.json",
      },
    ],
  },
  // Sets NODE_ENV=test + AI_PROVIDER_MODE=fake for all suites.
  setupFilesAfterEnv: ["<rootDir>/test/setup-e2e.ts"],
  testPathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
    // Legacy executable assert scripts (run via tsx today). Keep out of Jest.
    "<rootDir>/src/ai/providers/audio-to-linear16.spec.ts",
    "<rootDir>/src/ai/providers/gcp-speech-streaming.stt.spec.ts",
  ],
  clearMocks: true,
  // Sequential is safer with shared Postgres truncate helpers.
  maxWorkers: 1,
};
