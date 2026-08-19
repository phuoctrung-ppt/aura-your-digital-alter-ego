import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * JWT secret / TTL accessors via ConfigService (no bare process.env).
 * Fail boot / signing when secrets are missing in non-test environments.
 * Optional TTL overrides: JWT_ACCESS_TTL_SEC, JWT_REFRESH_TTL_SEC.
 */

const TEST_ACCESS_SECRET = "test-only-jwt-access-secret";

export function isTestEnv(config: ConfigService): boolean {
  return (config.get<string>("NODE_ENV") ?? "").trim() === "test";
}

export function requireAccessSecret(config: ConfigService): string {
  const secret = config.get<string>("JWT_ACCESS_SECRET")?.trim();
  if (secret) {
    return secret;
  }
  if (isTestEnv(config)) {
    return TEST_ACCESS_SECRET;
  }
  throw new Error(
    "JWT_ACCESS_SECRET is missing or empty — refuse to sign access tokens",
  );
}

export function requireRefreshSecret(config: ConfigService): string {
  const secret = config.get<string>("JWT_REFRESH_SECRET")?.trim();
  if (secret) {
    return secret;
  }
  if (isTestEnv(config)) {
    return "test-only-jwt-refresh-secret";
  }
  throw new Error(
    "JWT_REFRESH_SECRET is missing or empty — refuse to boot AuthModule",
  );
}

/** Access TTL seconds — default 900 (15m). Override: JWT_ACCESS_TTL_SEC. */
export function accessTtlSec(config: ConfigService): number {
  const raw = Number(config.get<string>("JWT_ACCESS_TTL_SEC") ?? 900);
  return Number.isFinite(raw) && raw > 0 ? raw : 900;
}

/** Refresh TTL seconds — default 604800 (7d). Override: JWT_REFRESH_TTL_SEC. */
export function refreshTtlSec(config: ConfigService): number {
  const raw = Number(config.get<string>("JWT_REFRESH_TTL_SEC") ?? 604_800);
  return Number.isFinite(raw) && raw > 0 ? raw : 604_800;
}

/**
 * Injectable wrapper so Nest providers can depend on typed secret helpers
 * without reading process.env directly.
 */
@Injectable()
export class AuthSecrets {
  constructor(private readonly config: ConfigService) {}

  accessSecret(): string {
    return requireAccessSecret(this.config);
  }

  refreshSecret(): string {
    return requireRefreshSecret(this.config);
  }

  accessTtlSec(): number {
    return accessTtlSec(this.config);
  }

  refreshTtlSec(): number {
    return refreshTtlSec(this.config);
  }

  isTest(): boolean {
    return isTestEnv(this.config);
  }
}
