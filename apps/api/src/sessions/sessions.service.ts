import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DEFAULT_LOCALE,
  ErrorCodes,
  ok,
  type CreateSessionRequest,
  type CreateSessionResponse,
  type EndSessionResponse,
  type GetSessionResponse,
  type PersonaSlug,
  type Session,
  type SessionListQuery,
  type SessionListResponse,
  type SessionStatus,
} from "@aura/contracts";
import type { Persona, Session as PrismaSession } from "@prisma/client";
import { AppLogger } from "../common";
import { PrismaService } from "../prisma/prisma.service";

/** Opaque cursor payload for session list (startedAt desc, id desc). */
type SessionCursor = {
  startedAt: string;
  id: string;
};

type SessionWithPersona = PrismaSession & {
  persona: Pick<Persona, "slug">;
};

/**
 * Sessions service — user-scoped session lifecycle (create / list / get / end).
 * Turns, memory, and AI orchestration are out of scope for M4.
 *
 * Rate limit: session create uses named throttle `sessionCreate` (10/min).
 * Default ThrottlerGuard tracks by IP — true per-user keying is deferred
 * (no Redis / custom getTracker in MVP). See SessionsController comment.
 */
@Injectable()
export class SessionsService {
  private readonly logger = new AppLogger(SessionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create an open session for the authenticated user.
   * Resolves `personaSlug` → `personaId`; default locale `vi`.
   */
  async create(
    userId: string,
    input: CreateSessionRequest,
  ): Promise<CreateSessionResponse> {
    const persona = await this.prisma.persona.findUnique({
      where: { slug: input.personaSlug },
      select: { id: true, slug: true },
    });
    if (!persona) {
      // Zod already constrains slug enum; missing row means seed/catalog gap.
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: "Persona not found",
      });
    }

    const row = await this.prisma.session.create({
      data: {
        userId,
        personaId: persona.id,
        status: "open",
        locale: input.locale ?? DEFAULT_LOCALE,
      },
      include: {
        persona: { select: { slug: true } },
      },
    });

    this.logger.log(
      `session.create userId=${userId} sessionId=${row.id} persona=${persona.slug}`,
    );
    return ok(this.toSessionDto(row));
  }

  /**
   * Cursor-paginated list of the caller's sessions.
   * Always scoped to `userId`; optional persona slug + status filters.
   */
  async list(
    userId: string,
    query: SessionListQuery,
  ): Promise<SessionListResponse> {
    const limit = query.limit;
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;

    const rows = await this.prisma.session.findMany({
      where: {
        userId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.persona
          ? { persona: { slug: query.persona } }
          : {}),
        ...(cursor
          ? {
              OR: [
                { startedAt: { lt: new Date(cursor.startedAt) } },
                {
                  AND: [
                    { startedAt: new Date(cursor.startedAt) },
                    { id: { lt: cursor.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      include: {
        persona: { select: { slug: true } },
      },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last
        ? this.encodeCursor({ startedAt: last.startedAt, id: last.id })
        : null;

    return ok({
      items: page.map((row) => this.toSessionDto(row)),
      nextCursor,
      limit,
    });
  }

  /**
   * Get one session owned by the caller.
   * Cross-user / missing → 404 SESSION_NOT_FOUND (no existence leak).
   */
  async get(userId: string, id: string): Promise<GetSessionResponse> {
    const row = await this.findOwned(userId, id);
    return ok(this.toSessionDto(row));
  }

  /**
   * End an open session (idempotent if already ended).
   */
  async end(userId: string, id: string): Promise<EndSessionResponse> {
    const existing = await this.findOwned(userId, id);
    if (existing.status === "ended") {
      return ok(this.toSessionDto(existing));
    }

    const row = await this.prisma.session.update({
      where: { id: existing.id },
      data: {
        status: "ended",
        endedAt: new Date(),
      },
      include: {
        persona: { select: { slug: true } },
      },
    });

    this.logger.log(`session.end userId=${userId} sessionId=${row.id}`);
    return ok(this.toSessionDto(row));
  }

  private async findOwned(
    userId: string,
    id: string,
  ): Promise<SessionWithPersona> {
    const row = await this.prisma.session.findFirst({
      where: { id, userId },
      include: {
        persona: { select: { slug: true } },
      },
    });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCodes.SESSION_NOT_FOUND,
        message: "Session not found",
      });
    }
    return row;
  }

  private toSessionDto(row: SessionWithPersona): Session {
    return {
      id: row.id,
      userId: row.userId,
      personaSlug: row.persona.slug as PersonaSlug,
      status: row.status as SessionStatus,
      locale: row.locale,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    };
  }

  private encodeCursor(row: { startedAt: Date; id: string }): string {
    const payload: SessionCursor = {
      startedAt: row.startedAt.toISOString(),
      id: row.id,
    };
    return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  }

  private decodeCursor(cursor: string): SessionCursor {
    try {
      const json = Buffer.from(cursor, "base64url").toString("utf8");
      const parsed: unknown = JSON.parse(json);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        typeof (parsed as SessionCursor).startedAt !== "string" ||
        typeof (parsed as SessionCursor).id !== "string"
      ) {
        throw new Error("invalid cursor shape");
      }
      const startedAt = (parsed as SessionCursor).startedAt;
      const id = (parsed as SessionCursor).id;
      // Reject non-parseable timestamps early.
      if (Number.isNaN(Date.parse(startedAt))) {
        throw new Error("invalid cursor startedAt");
      }
      return { startedAt, id };
    } catch {
      throw new BadRequestException({
        code: ErrorCodes.VALIDATION_ERROR,
        message: "Invalid cursor",
      });
    }
  }
}
