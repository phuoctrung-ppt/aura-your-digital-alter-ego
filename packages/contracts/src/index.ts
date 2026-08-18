/**
 * @aura/contracts — shared Zod request/response schemas for Aura REST `/v1`.
 *
 * Source of truth for wire shapes. Documented in `docs/contracts/v1-aura.md`.
 * Consumers: apps/api, apps/mobile — import from `@aura/contracts` only.
 */

/** Package / schema set version (semver-ish; bump on breaking contract changes). */
export const CONTRACTS_VERSION = "0.1.0" as const;

export * from "./error-codes.js";
export * from "./common.js";
export * from "./envelope.js";
export * from "./auth.js";
export * from "./personas.js";
export * from "./sessions.js";
export * from "./turns.js";
export * from "./memory.js";
export * from "./history.js";
export * from "./health.js";
