import { Injectable } from "@nestjs/common";
import {
  ok,
  type DeleteHistoryResponse,
  type DeleteHistoryResponseData,
} from "@aura/contracts";
import { AppLogger } from "../../common";
import { PrismaService } from "../../prisma/prisma.service";
import { AudioStorage } from "../../ai/audio-storage";

/**
 * History wipe service — hard-delete caller sessions / turns / memory / safety + audio.
 * Does **not** delete User or RefreshToken rows.
 * Memory prompt injection remains in MemoryService.listActiveFacts (M5).
 */
@Injectable()
export class HistoryService {
  private readonly logger = new AppLogger(HistoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audioStorage: AudioStorage,
  ) {}

  /**
   * DELETE /v1/me/history — irreversible user-scoped wipe.
   * DB deletes run in a transaction; audio dirs are best-effort after commit.
   * Never logs transcripts / emails — sessionId only for FS warnings.
   */
  async wipeForUser(userId: string): Promise<DeleteHistoryResponse> {
    const { sessionIds, counts } = await this.prisma.$transaction(
      async (tx) => {
        const sessions = await tx.session.findMany({
          where: { userId },
          select: { id: true },
        });
        const sessionIds = sessions.map((s) => s.id);

        const deletedTurns =
          sessionIds.length === 0
            ? 0
            : await tx.turn.count({
                where: { sessionId: { in: sessionIds } },
              });
        const deletedMemoryItems = await tx.memoryItem.count({
          where: { userId },
        });
        const deletedSessions = sessionIds.length;

        // Safe order: turns → sessions → memory → safety.
        // MemoryItem.sourceTurnId / SafetyEvent.sessionId use onDelete: SetNull.
        if (sessionIds.length > 0) {
          await tx.turn.deleteMany({
            where: { sessionId: { in: sessionIds } },
          });
        }
        await tx.session.deleteMany({ where: { userId } });
        await tx.memoryItem.deleteMany({ where: { userId } });
        await tx.safetyEvent.deleteMany({ where: { userId } });

        const data: DeleteHistoryResponseData = {
          ok: true,
          deletedSessions,
          deletedTurns,
          deletedMemoryItems,
        };
        return { sessionIds, counts: data };
      },
    );

    for (const sessionId of sessionIds) {
      try {
        await this.audioStorage.deleteSessionDir(sessionId);
      } catch (err) {
        this.logger.warn(
          `history.wipe audio delete failed sessionId=${sessionId}: ${
            err instanceof Error ? err.message : "unknown"
          }`,
        );
      }
    }

    return ok(counts);
  }
}
