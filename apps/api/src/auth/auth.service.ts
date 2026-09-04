import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes } from "crypto";
import * as bcrypt from "bcrypt";
import {
  ErrorCodes,
  ok,
  type AuthTokens,
  type LoginRequest,
  type LoginResponse,
  type LogoutRequest,
  type LogoutResponse,
  type RefreshRequest,
  type RefreshResponse,
  type RegisterRequest,
  type RegisterResponse,
} from "@aura/contracts";
import type { User as PrismaUser } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "../users/users.service";
import { AppLogger } from "../common";
import { AuthSecrets } from "./auth-secrets";

/** bcrypt cost factor — AGENTS / security skill require ≥ 12. */
const BCRYPT_COST = 12;

/**
 * Valid bcrypt hash used only to burn compare time when user is missing
 * (reduces user-enumeration timing hints). Not a real password.
 */
const DUMMY_PASSWORD_HASH =
  "$2b$12$lf02jC51UbDuH9U5HTjpkesx7OX3/cN1axSRKR8Q.MdNc0ngiFMFW";

@Injectable()
export class AuthService {
  private readonly logger = new AppLogger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly secrets: AuthSecrets,
  ) {}

  async register(input: RegisterRequest): Promise<RegisterResponse> {
    const email = this.users.normalizeEmail(input.email);
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new ConflictException({
        code: ErrorCodes.EMAIL_TAKEN,
        message: "Email already registered",
      });
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    let user: PrismaUser;
    try {
      user = await this.users.create({
        email,
        passwordHash,
        locale: input.locale,
      });
    } catch (err: unknown) {
      // Unique race on email
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        throw new ConflictException({
          code: ErrorCodes.EMAIL_TAKEN,
          message: "Email already registered",
        });
      }
      throw err;
    }

    const tokens = await this.issueTokenPair(user);
    return ok({ user: this.users.toPublicUser(user), tokens });
  }

  async login(input: LoginRequest): Promise<LoginResponse> {
    const email = this.users.normalizeEmail(input.email);
    const user = await this.users.findByEmail(email);
    // Same message for missing user / bad password — no enumeration.
    const invalid = () =>
      new UnauthorizedException({
        code: ErrorCodes.INVALID_CREDENTIALS,
        message: "Invalid email or password",
      });

    if (!user) {
      // Burn cycles roughly like a compare to reduce timing hints.
      await bcrypt.compare(input.password, DUMMY_PASSWORD_HASH);
      throw invalid();
    }

    const match = await bcrypt.compare(input.password, user.passwordHash);
    if (!match) {
      throw invalid();
    }

    const tokens = await this.issueTokenPair(user);
    return ok({ user: this.users.toPublicUser(user), tokens });
  }

  async refresh(input: RefreshRequest): Promise<RefreshResponse> {
    const tokenHash = this.hashRefreshToken(input.refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored) {
      throw new UnauthorizedException({
        code: ErrorCodes.TOKEN_INVALID,
        message: "Invalid refresh token",
      });
    }

    // Reuse of a revoked/rotated token → theft signal: revoke all for user.
    if (stored.revokedAt) {
      await this.revokeAllRefreshTokens(stored.userId);
      this.logger.warn(`auth.refresh.reuse userId=${stored.userId}`);
      throw new UnauthorizedException({
        code: ErrorCodes.REFRESH_REVOKED,
        message: "Refresh token revoked",
      });
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      await this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException({
        code: ErrorCodes.TOKEN_EXPIRED,
        message: "Refresh token expired",
      });
    }

    const user = await this.users.findById(stored.userId);
    if (!user) {
      await this.revokeAllRefreshTokens(stored.userId);
      throw new UnauthorizedException({
        code: ErrorCodes.TOKEN_INVALID,
        message: "Invalid refresh token",
      });
    }

    const tokens = await this.rotateRefreshToken(stored.id, user);
    return ok({ tokens });
  }

  async logout(userId: string, input: LogoutRequest): Promise<LogoutResponse> {
    if (input.refreshToken) {
      const tokenHash = this.hashRefreshToken(input.refreshToken);
      const stored = await this.prisma.refreshToken.findUnique({
        where: { tokenHash },
      });
      // Only revoke if owned by the authenticated user (ignore otherwise).
      if (stored && stored.userId === userId && !stored.revokedAt) {
        await this.prisma.refreshToken.update({
          where: { id: stored.id },
          data: { revokedAt: new Date() },
        });
      }
    } else {
      await this.revokeAllRefreshTokens(userId);
    }

    return ok({ ok: true as const });
  }

  async me(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) {
      // Prefer 401 for probe consistency (token subject no longer valid).
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: "Unauthorized",
      });
    }
    return ok(this.users.toPublicUser(user));
  }

  // ── Token helpers ──────────────────────────────────────────────────────────

  private async issueTokenPair(user: PrismaUser): Promise<AuthTokens> {
    const accessToken = await this.signAccessToken(user);
    const rawRefresh = this.generateRefreshToken();
    const tokenHash = this.hashRefreshToken(rawRefresh);
    const expiresAt = new Date(Date.now() + this.secrets.refreshTtlSec() * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefresh,
      expiresIn: this.secrets.accessTtlSec(),
      tokenType: "Bearer",
    };
  }

  /**
   * Rotate: revoke old row, create new, link via replacedById (old → new).
   */
  private async rotateRefreshToken(
    oldTokenId: string,
    user: PrismaUser,
  ): Promise<AuthTokens> {
    const accessToken = await this.signAccessToken(user);
    const rawRefresh = this.generateRefreshToken();
    const tokenHash = this.hashRefreshToken(rawRefresh);
    const expiresAt = new Date(Date.now() + this.secrets.refreshTtlSec() * 1000);

    await this.prisma.$transaction(async (tx) => {
      const next = await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });
      await tx.refreshToken.update({
        where: { id: oldTokenId },
        data: {
          revokedAt: new Date(),
          replacedById: next.id,
        },
      });
      return next;
    });

    return {
      accessToken,
      refreshToken: rawRefresh,
      expiresIn: this.secrets.accessTtlSec(),
      tokenType: "Bearer",
    };
  }

  private async signAccessToken(user: PrismaUser): Promise<string> {
    // Payload: sub = userId, email for AuthUser projection. Signed with JWT_ACCESS_SECRET.
    return this.jwt.signAsync(
      { sub: user.id, email: user.email },
      {
        secret: this.secrets.accessSecret(),
        expiresIn: this.secrets.accessTtlSec(),
      },
    );
  }

  /** Opaque refresh token (base64url). Only the sha256 hash is persisted. */
  private generateRefreshToken(): string {
    return randomBytes(48).toString("base64url");
  }

  private hashRefreshToken(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
  }

  private async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
