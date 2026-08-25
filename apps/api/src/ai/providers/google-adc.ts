import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { GoogleAuth } from "google-auth-library";

const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

/** Refresh a few minutes before expiry so mid-request 401s are rare. */
const EXPIRY_SKEW_MS = 60_000;

type CachedToken = {
  accessToken: string;
  expiresAtMs: number;
};

let authClient: GoogleAuth | undefined;
let cached: CachedToken | undefined;
let inflight: Promise<string> | undefined;
let cachedQuotaProject: string | null | undefined;

function getAuth(): GoogleAuth {
  if (!authClient) {
    authClient = new GoogleAuth({
      scopes: [CLOUD_PLATFORM_SCOPE],
    });
  }
  return authClient;
}

/**
 * Quota / billing project for user ADC REST calls.
 * User credentials often need `x-goog-user-project` when calling Speech / TTS
 * (and some other APIs) via raw fetch — Google client libs attach this from
 * ADC `quota_project_id`, but Nest providers use fetch.
 *
 * Resolution order:
 * 1. `GOOGLE_CLOUD_QUOTA_PROJECT`
 * 2. `VERTEX_PROJECT_ID` / `GCLOUD_PROJECT` / `GOOGLE_CLOUD_PROJECT`
 * 3. ADC credentials file `quota_project_id` (from
 *    `gcloud auth application-default set-quota-project`)
 */
export function resolveGoogleQuotaProject(): string | undefined {
  if (cachedQuotaProject !== undefined) {
    return cachedQuotaProject ?? undefined;
  }

  const fromEnv =
    process.env.GOOGLE_CLOUD_QUOTA_PROJECT?.trim() ||
    process.env.VERTEX_PROJECT_ID?.trim() ||
    process.env.GCLOUD_PROJECT?.trim() ||
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    undefined;

  if (fromEnv) {
    cachedQuotaProject = fromEnv;
    return fromEnv;
  }

  const fromAdc = readQuotaProjectFromAdcFile();
  cachedQuotaProject = fromAdc ?? null;
  return fromAdc;
}

function readQuotaProjectFromAdcFile(): string | undefined {
  try {
    const explicit = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
    const path =
      explicit ||
      join(homedir(), ".config", "gcloud", "application_default_credentials.json");
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as { quota_project_id?: unknown };
    const id =
      typeof parsed.quota_project_id === "string"
        ? parsed.quota_project_id.trim()
        : "";
    return id.length > 0 ? id : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Application Default Credentials access token for GCP AI REST calls
 * (Vertex / Speech / TTS). Tokens are cached until near expiry.
 * Never log the token value.
 */
export async function getGoogleAccessToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAtMs - EXPIRY_SKEW_MS > now) {
    return cached.accessToken;
  }

  if (inflight) {
    return inflight;
  }

  inflight = (async () => {
    const client = await getAuth().getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken =
      typeof tokenResponse === "string"
        ? tokenResponse
        : tokenResponse?.token ?? undefined;

    if (!accessToken) {
      throw new Error("Google ADC did not return an access token");
    }

    // google-auth-library may expose expiry on the client; fall back to ~55m.
    const expiryDate =
      "expiry_date" in client && typeof client.expiry_date === "number"
        ? client.expiry_date
        : now + 55 * 60_000;

    cached = {
      accessToken,
      expiresAtMs: expiryDate,
    };
    return accessToken;
  })();

  try {
    return await inflight;
  } finally {
    inflight = undefined;
  }
}

/**
 * Headers for GCP REST calls under user ADC.
 * Always sets `Authorization`; adds `x-goog-user-project` when a quota
 * project is resolvable (required by Speech / Text-to-Speech for user creds).
 */
export async function getGoogleAuthHeaders(): Promise<Record<string, string>> {
  const accessToken = await getGoogleAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  const quotaProject = resolveGoogleQuotaProject();
  if (quotaProject) {
    headers["x-goog-user-project"] = quotaProject;
  }
  return headers;
}

/** Test-only: clear cached token / auth client / quota project. */
export function resetGoogleAdcCacheForTests(): void {
  cached = undefined;
  inflight = undefined;
  authClient = undefined;
  cachedQuotaProject = undefined;
}
