import { Controller, Delete, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser, type AuthUser } from "../../common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { HistoryService } from "./history.service";

/**
 * History wipe HTTP surface under `/v1/me/history`.
 * Global prefix `v1` is applied in main.ts — routes here omit the version segment.
 * Auth `GET /v1/me` lives on AuthController; this owns only DELETE history.
 *
 * Rate limit: named throttle `historyDelete` (5/min). Default ThrottlerGuard
 * keys by **IP** — AGENTS.md §6 wants per-user; deferred (same as sessionCreate).
 */
@ApiTags("history")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("me")
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  /** DELETE /v1/me/history — protected → DeleteHistoryResponse */
  @Delete("history")
  @Throttle({ historyDelete: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: "Hard-delete caller's sessions, turns, memory, safety events, and audio",
  })
  async wipe(@CurrentUser() user: AuthUser) {
    return this.history.wipeForUser(user.userId);
  }
}
