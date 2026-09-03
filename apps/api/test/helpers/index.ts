/**
 * E2E test helper barrel (M12).
 */

export {
  createTestApp,
  closeTestApp,
  truncateUserScopedData,
  type TestAppContext,
} from "./app";

export {
  registerUser,
  loginUser,
  registerFreshUser,
  authHeader,
  uniqueTestEmail,
  type TestAuthTokens,
  type TestCredentials,
} from "./auth";

export {
  expectOkEnvelope,
  expectErrorEnvelope,
  type EnvelopeSuccess,
  type EnvelopeError,
} from "./http";

export { buildSilentWavBuffer, writeSilentWavFixture } from "./audio";
