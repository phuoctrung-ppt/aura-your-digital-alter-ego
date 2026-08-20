/**
 * Fetch wrapper for Aura API.
 * Base URL from EXPO_PUBLIC_API_URL (AGENTS.md §13).
 * Parses `{ data, error }` envelope; attaches Bearer; single-flight refresh on 401.
 */

import type { AuthTokens, ErrorObject } from "@aura/contracts";
import { ErrorEnvelopeSchema } from "@aura/contracts";
import type { TokenStore } from "../session/token-store";

export type ApiClientOptions = {
  baseUrl?: string;
  getAccessToken?: () => Promise<string | null>;
  getRefreshToken?: () => Promise<string | null>;
  setTokens?: (tokens: {
    accessToken: string;
    refreshToken: string;
  }) => Promise<void>;
  /** Called when refresh fails or session is no longer valid. */
  onUnauthorized?: () => void | Promise<void>;
};

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    status: number,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type UnauthorizedHandler = () => void | Promise<void>;

let globalOnUnauthorized: UnauthorizedHandler | null = null;

/** Register a session-clear handler (SessionProvider wires this). */
export function setOnUnauthorized(handler: UnauthorizedHandler | null): void {
  globalOnUnauthorized = handler;
}

const NO_REFRESH_PATHS = new Set([
  "/v1/auth/login",
  "/v1/auth/register",
  "/v1/auth/refresh",
]);

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function errorFromBody(
  body: unknown,
  status: number,
  fallbackMessage: string,
): ApiError {
  const parsed = ErrorEnvelopeSchema.safeParse(body);
  if (parsed.success) {
    const err: ErrorObject = parsed.data.error;
    return new ApiError(err.code, err.message, status, err.details);
  }
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    body.error &&
    typeof body.error === "object"
  ) {
    const err = body.error as Record<string, unknown>;
    const code = typeof err.code === "string" ? err.code : "INTERNAL_ERROR";
    const message =
      typeof err.message === "string" ? err.message : fallbackMessage;
    return new ApiError(code, message, status, err.details);
  }
  return new ApiError(
    status === 401 ? "UNAUTHORIZED" : "INTERNAL_ERROR",
    fallbackMessage,
    status,
  );
}

export class ApiClient {
  private baseUrl: string;
  private getAccessToken?: () => Promise<string | null>;
  private getRefreshToken?: () => Promise<string | null>;
  private setTokens?: (tokens: {
    accessToken: string;
    refreshToken: string;
  }) => Promise<void>;
  private onUnauthorized?: () => void | Promise<void>;
  private refreshInFlight: Promise<boolean> | null = null;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = (
      options.baseUrl ??
      process.env.EXPO_PUBLIC_API_URL ??
      "http://0.0.0.0:3001"
    ).replace(/\/$/, "");
    this.getAccessToken = options.getAccessToken;
    this.getRefreshToken = options.getRefreshToken;
    this.setTokens = options.setTokens;
    this.onUnauthorized = options.onUnauthorized;
  }

  /** Rebind token accessors after SessionProvider mounts. */
  configure(options: ApiClientOptions): void {
    if (options.baseUrl !== undefined) {
      this.baseUrl = options.baseUrl.replace(/\/$/, "");
    }
    if (options.getAccessToken !== undefined) {
      this.getAccessToken = options.getAccessToken;
    }
    if (options.getRefreshToken !== undefined) {
      this.getRefreshToken = options.getRefreshToken;
    }
    if (options.setTokens !== undefined) {
      this.setTokens = options.setTokens;
    }
    if (options.onUnauthorized !== undefined) {
      this.onUnauthorized = options.onUnauthorized;
    }
  }

  async request<T = unknown>(
    path: string,
    init: RequestInit = {},
    opts: { skipAuth?: boolean; skipRefresh?: boolean } = {},
  ): Promise<T> {
    const normalized = normalizePath(path);
    const headers = new Headers(init.headers);

    // FormData must keep the runtime multipart boundary — do not force JSON.
    // RN FormData may not pass `instanceof FormData` across realms — also check tag.
    const bodyIsFormData =
      typeof FormData !== "undefined" &&
      !!init.body &&
      (init.body instanceof FormData ||
        Object.prototype.toString.call(init.body) === "[object FormData]");
    if (!headers.has("Content-Type") && init.body && !bodyIsFormData) {
      headers.set("Content-Type", "application/json");
    }
    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }

    if (!opts.skipAuth && this.getAccessToken) {
      const token = await this.getAccessToken();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    }

    const url = `${this.baseUrl}${normalized}`;
    const res = await fetch(url, { ...init, headers });
    const body = await readBody(res);

    if (res.ok) {
      if (
        body &&
        typeof body === "object" &&
        "error" in body &&
        (body as { error: unknown }).error !== null
      ) {
        throw errorFromBody(body, res.status, `API error ${normalized}`);
      }
      return body as T;
    }

    const apiError = errorFromBody(
      body,
      res.status,
      `API ${res.status} ${normalized}`,
    );

    const canRefresh =
      res.status === 401 &&
      !opts.skipRefresh &&
      !opts.skipAuth &&
      !NO_REFRESH_PATHS.has(normalized);

    if (canRefresh) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        return this.request<T>(path, init, {
          ...opts,
          skipRefresh: true,
        });
      }
      await this.notifyUnauthorized();
    }

    throw apiError;
  }

  private async tryRefresh(): Promise<boolean> {
    if (!this.getRefreshToken || !this.setTokens) {
      return false;
    }

    if (!this.refreshInFlight) {
      this.refreshInFlight = this.doRefresh().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<boolean> {
    try {
      const refreshToken = await this.getRefreshToken?.();
      if (!refreshToken) return false;

      const url = `${this.baseUrl}/v1/auth/refresh`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ refreshToken }),
      });
      const body = await readBody(res);

      if (!res.ok) {
        return false;
      }

      const tokens = (
        body as {
          data?: { tokens?: AuthTokens };
        } | null
      )?.data?.tokens;

      if (!tokens?.accessToken || !tokens?.refreshToken) {
        return false;
      }

      await this.setTokens?.({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
      return true;
    } catch {
      return false;
    }
  }

  private async notifyUnauthorized(): Promise<void> {
    const handler = this.onUnauthorized ?? globalOnUnauthorized;
    if (handler) {
      await handler();
    }
  }
}

/** Default singleton — SessionProvider configures token accessors. */
export const apiClient = new ApiClient();

/** Helper for tests / custom stores: wire client to a TokenStore. */
export function bindClientToStore(
  client: ApiClient,
  store: TokenStore,
  onUnauthorized?: () => void | Promise<void>,
): void {
  client.configure({
    getAccessToken: () => store.getAccessToken(),
    getRefreshToken: () => store.getRefreshToken(),
    setTokens: (tokens) => store.setTokens(tokens),
    onUnauthorized,
  });
}
