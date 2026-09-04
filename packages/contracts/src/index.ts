/**
 * @aura/contracts — shared Zod request/response schemas for Aura REST `/v1`
 * and Socket.IO voice events (`/v1/voice`).
 *
 * Source of truth for wire shapes. Documented in `docs/contracts/v1-aura.md`.
 * Consumers: apps/api, apps/mobile — import from `@aura/contracts` only.
 */

/**
 * Package / schema set version (semver-ish; bump on breaking contract changes).
 * 0.2.0 — additive M7.5 Socket.IO streaming-PTT events (`turns-ws`) + WS error codes.
 * 0.3.0 — [BREAKING] M15 PersonaConfig: required `tone` / `supportedLanguages` /
 *         `voiceByLocale` on `PersonaSchema`; session reply locale tightened to `vi|en`.
 */
export const CONTRACTS_VERSION = "0.3.0" as const;

export * from "./error-codes.js";
export * from "./common.js";
export * from "./envelope.js";
export * from "./auth.js";
export * from "./personas.js";
export * from "./sessions.js";
export * from "./turns.js";
export * from "./turns-ws.js";
export * from "./memory.js";
export * from "./history.js";
export * from "./health.js";
export * from "./voice.js";