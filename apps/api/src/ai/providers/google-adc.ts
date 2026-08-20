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

function getAuth(): GoogleAuth {
  if (!authClient) {
    authClient = new GoogleAuth({
      scopes: [CLOUD_PLATFORM_SCOPE],
    });
  }
  return authClient;
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

/** Test-only: clear cached token / auth client. */
export function resetGoogleAdcCacheForTests(): void {
  cached = undefined;
  inflight = undefined;
  authClient = undefined;
}
