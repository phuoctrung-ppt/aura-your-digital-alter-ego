import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { AuthModule } from "../auth/auth.module";
import { MemoryModule } from "../memory/memory.module";
import { SafetyModule } from "../safety/safety.module";
import { SessionsModule } from "../sessions/sessions.module";
import { TurnsController } from "./turns.controller";
import { TurnsService } from "./turns.service";

/**
 * Turns module — POST /v1/sessions/:id/turns (SP-3 multipart).
 * Imports AI / safety / memory / sessions for orchestrator pipeline wiring.
 * Scaffold: controller + service 501 stubs; no multer / Prisma / provider HTTP.
 */
@Module({
  imports: [
    AuthModule,
    AiModule,
    SafetyModule,
    MemoryModule,
    SessionsModule,
  ],
  controllers: [TurnsController],
  providers: [TurnsService],
  exports: [TurnsService],
})
export class TurnsModule {}
