import { JwtService } from "@nestjs/jwt";
import type { Socket } from "socket.io";
import type { AuthUser } from "../common";
import type { AuthSecrets } from "../auth/auth-secrets";

export const VOICE_SOCKET_USER_KEY = "auraUser" as const;

type HandshakeAuth = {
  token?: unknown;
};

/**
 * Extract access JWT from Socket.IO handshake.
 * Prefers `auth.token`; also accepts `Authorization: Bearer …` header.
 * Never accepts refresh tokens (verified with access secret only).
 */
export function extractAccessTokenFromHandshake(socket: Socket): string | null {
  const auth = (socket.handshake.auth ?? {}) as HandshakeAuth;
  if (typeof auth.token === "string" && auth.token.trim().length > 0) {
    return auth.token.trim();
  }

  const header =
    socket.handshake.headers?.authorization ??
    socket.handshake.headers?.Authorization;
  const raw = Array.isArray(header) ? header[0] : header;
  if (typeof raw === "string") {
    const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  // Some clients put the token in the query string (discouraged; last resort).
  const queryToken = socket.handshake.query?.token;
  if (typeof queryToken === "string" && queryToken.trim().length > 0) {
    return queryToken.trim();
  }

  return null;
}

/**
 * Verify access JWT and return `{ userId, email }` from `{ sub, email }`.
 * Returns null when missing/invalid/expired — caller must reject the connect.
 */
export async function verifyVoiceAccessToken(
  jwt: JwtService,
  secrets: AuthSecrets,
  token: string,
): Promise<AuthUser | null> {
  try {
    const payload = await jwt.verifyAsync<{
      sub?: string;
      email?: string;
      typ?: string;
    }>(token, {
      secret: secrets.accessSecret(),
    });
    // Refuse refresh tokens if they carry an explicit typ claim.
    if (payload?.typ === "refresh") {
      return null;
    }
    if (!payload?.sub || !payload?.email) {
      return null;
    }
    return { userId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export function getSocketUser(socket: Socket): AuthUser | undefined {
  return (socket.data as { [VOICE_SOCKET_USER_KEY]?: AuthUser })[
    VOICE_SOCKET_USER_KEY
  ];
}

export function setSocketUser(socket: Socket, user: AuthUser): void {
  (socket.data as { [VOICE_SOCKET_USER_KEY]?: AuthUser })[
    VOICE_SOCKET_USER_KEY
  ] = user;
}
