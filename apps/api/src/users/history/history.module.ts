import { forwardRef, Module } from "@nestjs/common";
import { AiModule } from "../../ai/ai.module";
import { AuthModule } from "../../auth/auth.module";
import { HistoryController } from "./history.controller";
import { HistoryService } from "./history.service";

/**
 * History wipe module (M9 scaffold) — lives under `users/history` path.
 * Kept as its own Nest module (peer to Sessions/Memory) so AuthModule does not
 * create a circular import via UsersModule.
 * PrismaModule is @Global; AuthModule supplies JwtAuthGuard; AiModule exports AudioStorage.
 */
@Module({
  imports: [AuthModule, forwardRef(() => AiModule)],
  controllers: [HistoryController],
  providers: [HistoryService],
  exports: [HistoryService],
})
export class HistoryModule {}
