import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ErrorCodes } from "@aura/contracts";
import type { AuthUser } from "../../common";
import { requireAccessSecret } from "../auth-secrets";

/**
 * JWT access-token strategy.
 * Reads JWT_ACCESS_SECRET via ConfigService (throws if missing/empty outside test).
 * Does not accept refresh tokens.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requireAccessSecret(config),
    });
  }

  /** Passport validate — return value becomes `request.user`. */
  validate(payload: { sub?: string; email?: string }): AuthUser {
    if (!payload?.sub || !payload?.email) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: "Invalid access token payload",
      });
    }
    return { userId: payload.sub, email: payload.email };
  }
}
