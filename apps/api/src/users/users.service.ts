import { Injectable } from "@nestjs/common";
import type { User as PrismaUser } from "@prisma/client";
import { DEFAULT_LOCALE, type User as PublicUser } from "@aura/contracts";
import { PrismaService } from "../prisma/prisma.service";

/**
 * User persistence for auth.
 * Never return `passwordHash` from public mappers.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Trim + lowercase — emails are unique on normalized form. */
  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  findByEmail(email: string): Promise<PrismaUser | null> {
    return this.prisma.user.findUnique({
      where: { email: this.normalizeEmail(email) },
    });
  }

  findById(id: string): Promise<PrismaUser | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(input: {
    email: string;
    passwordHash: string;
    locale?: string;
  }): Promise<PrismaUser> {
    return this.prisma.user.create({
      data: {
        email: this.normalizeEmail(input.email),
        passwordHash: input.passwordHash,
        locale: input.locale?.trim() || DEFAULT_LOCALE,
      },
    });
  }

  async updateVoicePreference(userId: string, voiceId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { selectedVoiceId: voiceId },
    });
  }

  /**
   * Public UserSchema projection — ISO-8601 with offset (`Z` = UTC).
   * Never includes passwordHash.
   */
  toPublicUser(user: PrismaUser): PublicUser {
    return {
      id: user.id,
      email: user.email,
      locale: user.locale,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
