import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { AuthModule } from "../auth/auth.module";
import { SessionsModule } from "../sessions/sessions.module";
import { VoiceGateway } from "./voice.gateway";

/**
 * Realtime module — Socket.IO voice gateway (ADR-0005 / M7.5).
 * Shares AuthModule JWT + AiModule orchestrator / streaming STT with REST.
 */
@Module({
  imports: [AuthModule, AiModule, SessionsModule],
  providers: [VoiceGateway],
  exports: [VoiceGateway],
})
export class RealtimeModule {}
