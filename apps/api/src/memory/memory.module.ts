import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MemoryController } from "./memory.controller";
import { MemoryService } from "./memory.service";

/**
 * Memory module — list + best-effort extract (M5).
 * PrismaModule is @Global; AuthModule supplies JwtAuthGuard / Passport JWT.
 * Prompt injection via MemoryService.listActiveFacts is already wired in the
 * orchestrator (M5) — M9 verifies only. History wipe lives in HistoryModule
 * (`users/history`, T-M9-01); do not replace this module.
 */
@Module({
  imports: [AuthModule],
  controllers: [MemoryController],
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
