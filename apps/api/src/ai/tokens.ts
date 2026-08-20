/**
 * Nest DI tokens for pluggable AI providers (ADR-0003).
 * Backend-worker wires concrete providers in AiModule.
 */

export const CHAT_PROVIDER = Symbol("CHAT_PROVIDER");
export const CHAT_PROVIDER_FALLBACK = Symbol("CHAT_PROVIDER_FALLBACK");
export const STT_PROVIDER = Symbol("STT_PROVIDER");
export const STT_PROVIDER_FALLBACK = Symbol("STT_PROVIDER_FALLBACK");
export const TTS_PROVIDER = Symbol("TTS_PROVIDER");
export const TTS_PROVIDER_FALLBACK = Symbol("TTS_PROVIDER_FALLBACK");
