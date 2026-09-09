import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ErrorCodes } from "@aura/contracts";
import type { AuthUser } from "../../common";

/**
 * Protects routes with Bearer JWT (passport strategy: `jwt`).
 * Failed auth → 401 UNAUTHORIZED (envelope-friendly via HttpEnvelopeExceptionFilter).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  override handleRequest<TUser = AuthUser>(
    err: Error | null,
    user: TUser | false,
    _info: unknown,
    _context: ExecutionContext,
    _status?: unknown,
  ): TUser {
    if (err || !user) {
      throw (
        err ??
        new UnauthorizedException({
          code: ErrorCodes.UNAUTHORIZED,
          message: "Unauthorized",
        })
      );
    }
    return user;
  }
}
