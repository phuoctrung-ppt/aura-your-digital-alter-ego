import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import {
  LoginRequestSchema,
  LogoutRequestSchema,
  RefreshRequestSchema,
  RegisterRequestSchema,
  type LoginRequest,
  type LogoutRequest,
  type RefreshRequest,
  type RegisterRequest,
} from "@aura/contracts";
import { CurrentUser, ZodValidationPipe, type AuthUser } from "../common";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";

/**
 * Auth HTTP surface under `/v1/auth/*` + acceptance probe `GET /v1/me`.
 * Public: register, login, refresh. Protected: logout, me.
 * Rate limit: 10/min per IP on register / login / refresh (AGENTS.md §6).
 * Global prefix `v1` is applied in main.ts — routes here omit the version segment.
 */
@ApiTags("auth")
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /v1/auth/register — public → 201 */
  @Post("auth/register")
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "Register a new user" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["email", "password"],
      properties: {
        email: { type: "string", format: "email" },
        password: { type: "string", minLength: 8 },
        locale: { type: "string", example: "vi" },
      },
    },
  })
  async register(
    @Body(new ZodValidationPipe(RegisterRequestSchema)) body: RegisterRequest,
  ) {
    return this.auth.register(body);
  }

  /** POST /v1/auth/login — public */
  @Post("auth/login")
  @HttpCode(200)
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "Login with email and password" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["email", "password"],
      properties: {
        email: { type: "string", format: "email" },
        password: { type: "string" },
      },
    },
  })
  async login(
    @Body(new ZodValidationPipe(LoginRequestSchema)) body: LoginRequest,
  ) {
    return this.auth.login(body);
  }

  /** POST /v1/auth/refresh — public (refresh token in body) */
  @Post("auth/refresh")
  @HttpCode(200)
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "Rotate refresh token and issue new access token" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["refreshToken"],
      properties: {
        refreshToken: { type: "string" },
      },
    },
  })
  async refresh(
    @Body(new ZodValidationPipe(RefreshRequestSchema)) body: RefreshRequest,
  ) {
    return this.auth.refresh(body);
  }

  /** POST /v1/auth/logout — protected */
  @Post("auth/logout")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Logout — revoke refresh token(s)" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        refreshToken: {
          type: "string",
          description:
            "When provided, revoke this token; otherwise revoke all for user",
        },
      },
    },
  })
  async logout(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(LogoutRequestSchema)) body: LogoutRequest,
  ) {
    return this.auth.logout(user.userId, body);
  }

  /**
   * GET /v1/me — protected sample / acceptance probe.
   * Returns 401 without Bearer token.
   */
  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiTags("users")
  @ApiOperation({ summary: "Current authenticated user" })
  async me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId);
  }
}
