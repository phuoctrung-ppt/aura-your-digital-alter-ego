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
