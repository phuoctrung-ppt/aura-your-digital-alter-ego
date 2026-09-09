/**
 * Public runtime flags for the mobile client.
 * EXPO_PUBLIC_* values are non-secret (AGENTS.md §13).
 */

export function isApiMockEnabled(): boolean {
  const flag = process.env.EXPO_PUBLIC_API_MOCK;
  if (flag === "1" || flag === "true") {
    return true;
  }
  return false;
}

export function getApiBaseUrl(): string {
  return (
    process.env.EXPO_PUBLIC_API_URL ?? "http://0.0.0.0:3001"
  ).replace(/\/$/, "");
}

/**
 * Socket.IO origin for voice namespace `/v1/voice`.
 * Defaults to API base when unset (same host/port as REST).
 */
export function getWsBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_WS_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  return getApiBaseUrl();
}

/**
 * Force REST multipart turn upload instead of WSS primary path.
 * Degraded / CI clients only — product default is Socket.IO (ADR-0005).
 */
export function isVoiceRestFallbackEnabled(): boolean {
  const flag = process.env.EXPO_PUBLIC_VOICE_REST_FALLBACK;
  return flag === "1" || flag === "true";
}
