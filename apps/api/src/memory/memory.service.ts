import {
  BadRequestException,
  Injectable,
} from "@nestjs/common";
import {
  ErrorCodes,
  ok,
  type MemoryItem as MemoryItemDto,
  type MemoryListQuery,
  type MemoryListResponse,
  type PersonaSlug,
} from "@aura/contracts";
import type { MemoryItem as PrismaMemoryItem, Persona } from "@prisma/client";
import { AppLogger } from "../common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Best-effort memory extraction input (inline after turn; queue layer off).
 */
export type ExtractMemoryInput = {
  userId: string;
  sessionId: string;
  personaId?: string;
  sourceTurnId: string;
  userTranscript: string;
  assistantText: string;
};

type MemoryCursor = {
  createdAt: string;
  id: string;
};

type MemoryWithPersona = PrismaMemoryItem & {
  persona: Pick<Persona, "slug"> | null;
};

/**
 * Memory service — list (settings/debug) + best-effort extract for orchestrator.
 * Active-fact injection into chat prompts is already M5 (`listActiveFacts`).
 * M9 verifies injection + owns wipe via HistoryService — do not replace here.
 */
@Injectable()
export class MemoryService {
  private readonly logger = new AppLogger(MemoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** GET /v1/memory — cursor list for caller (user-scoped). */
  async listForUser(
    userId: string,
    query: MemoryListQuery,
  ): Promise<MemoryListResponse> {
    const limit = query.limit;
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;

    const rows = await this.prisma.memoryItem.findMany({
      where: {
        userId,
        ...(query.activeOnly === false ? {} : { active: true }),
        ...(query.persona ? { persona: { slug: query.persona } } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.createdAt) } },
                {
                  AND: [
                    { createdAt: new Date(cursor.createdAt) },
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
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last
        ? this.encodeCursor({ createdAt: last.createdAt, id: last.id })
        : null;

    return ok({
      items: page.map((row) => this.toDto(row)),
      nextCursor,
      limit,
    });
  }

  /** Active memory facts for prompt injection (best-effort; capped). */
  async listActiveFacts(
    userId: string,
    opts?: { personaId?: string; limit?: number },
  ): Promise<string[]> {
    const limit = opts?.limit ?? 8;
    const rows = await this.prisma.memoryItem.findMany({
      where: {
        userId,
        active: true,
        ...(opts?.personaId
          ? {
              OR: [{ personaId: opts.personaId }, { personaId: null }],
            }
          : {}),
      },
      orderBy: [{ salience: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: { fact: true },
    });
    return rows.map((r) => r.fact).filter((f) => f.trim().length > 0);
  }

  /**
   * Best-effort MemoryItem extraction after a successful turn.
   * Failures are swallowed (log without transcripts). Heuristic MVP only.
   */
  async extractBestEffort(input: ExtractMemoryInput): Promise<void> {
    try {
      const fact = this.heuristicFact(input.userTranscript);
      if (!fact) return;

      await this.prisma.memoryItem.create({
        data: {
          userId: input.userId,
          personaId: input.personaId ?? null,
          sourceTurnId: input.sourceTurnId,
          fact,
          salience: 0.55,
          active: true,
        },
      });
    } catch (err) {
      this.logger.warn(
        `memory.extract failed sessionId=${input.sessionId}: ${
          err instanceof Error ? err.message : "unknown"
        }`,
      );
    }
  }

  private heuristicFact(transcript: string): string | null {
    const text = transcript.trim();
    if (!text) return null;

    // Company / org mentions
    const company =
      text.match(
        /(?:công\s*ty|cong\s*ty|company|tại|tai|at)\s+([A-ZÀ-Ỹ][\wÀ-ỹ&.-]{1,40})/i,
      ) ??
      text.match(/\b(?:at|for)\s+([A-Z][\w&.-]{1,40})\b/);
    if (company?.[1]) {
      return `Người dùng đề cập công ty/tổ chức: ${company[1]}`;
    }

    // Role / position
    const role = text.match(
      /(?:vị\s*trí|vi\s*tri|role|position|làm|lam)\s+(.{2,60}?)(?:\.|,|$)/i,
    );
    if (role?.[1]) {
      const clipped = role[1].trim().slice(0, 80);
      if (clipped.length >= 2) {
        return `Người dùng đề cập vị trí/vai trò: ${clipped}`;
      }
    }

    // Goal-like
    if (/(?:muốn|muon|want|goal|mục\s*tiêu|muc\s*tieu)/i.test(text)) {
      const clipped = text.slice(0, 120);
      return `Mục tiêu luyện tập (tóm tắt): ${clipped}`;
    }

    return null;
  }

  private toDto(row: MemoryWithPersona): MemoryItemDto {
    return {
      id: row.id,
      userId: row.userId,
      personaSlug: (row.persona?.slug as PersonaSlug | undefined) ?? null,
      fact: row.fact,
      sourceTurnId: row.sourceTurnId,
      salience: row.salience ?? undefined,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private encodeCursor(row: { createdAt: Date; id: string }): string {
    const payload: MemoryCursor = {
      createdAt: row.createdAt.toISOString(),
      id: row.id,
    };
    return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  }

  private decodeCursor(cursor: string): MemoryCursor {
    try {
      const json = Buffer.from(cursor, "base64url").toString("utf8");
      const parsed: unknown = JSON.parse(json);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        typeof (parsed as MemoryCursor).createdAt !== "string" ||
        typeof (parsed as MemoryCursor).id !== "string"
      ) {
        throw new Error("invalid cursor shape");
      }
      const createdAt = (parsed as MemoryCursor).createdAt;
      const id = (parsed as MemoryCursor).id;
      if (Number.isNaN(Date.parse(createdAt))) {
        throw new Error("invalid cursor createdAt");
      }
      return { createdAt, id };
    } catch {
      throw new BadRequestException({
        code: ErrorCodes.VALIDATION_ERROR,
        message: "Invalid cursor",
      });
    }
  }
}
