import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MemoryController } from "./memory.controller";
import { MemoryService } from "./memory.service";

/**
 * Memory module — list + best-effort extract (M5 scaffold).
 * PrismaModule is @Global; AuthModule supplies JwtAuthGuard / Passport JWT.
 * History wipe / prompt injection: M9 (T-M9-01).
 */
@Module({
  imports: [AuthModule],
  controllers: [MemoryController],
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
