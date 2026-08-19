import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { ErrorCodes } from "@aura/contracts";

/**
 * Authenticated user projection attached by JwtStrategy / JwtAuthGuard.
 * Matches JWT access payload: `sub` → `userId`, `email` → `email`.
 */
export type AuthUser = {
  userId: string;
  email: string;
};

/**
 * `@CurrentUser()` — reads `request.user` set by the passport JWT strategy.
 * Throws 401 when missing (route should also be behind JwtAuthGuard).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user?.userId || !user.email) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: "Unauthorized",
      });
    }
    return user;
  },
);
