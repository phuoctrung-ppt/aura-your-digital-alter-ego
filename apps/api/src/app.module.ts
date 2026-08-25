import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { resolve } from "path";
import { AiModule } from "./ai/ai.module";
import { AuthModule } from "./auth/auth.module";
import { HealthController } from "./health.controller";
import { MemoryModule } from "./memory/memory.module";
import { PersonasModule } from "./personas/personas.module";
import { PrismaModule } from "./prisma/prisma.module";
import { SafetyModule } from "./safety/safety.module";
import { SessionsModule } from "./sessions/sessions.module";
import { TurnsModule } from "./turns/turns.module";
import { UsersModule } from "./users/users.module";
import { HistoryModule } from "./users/history/history.module";
import { RealtimeModule } from "./realtime/realtime.module";

/**
 * Root application module.
 * Global: ConfigModule, named Throttler (`default` + `auth` + `sessionCreate` +
 * `voiceTurn` + `historyDelete`), ThrottlerGuard.
 * Feature: Prisma, Users, Auth, Personas, Sessions, Ai, Safety, Turns, Memory,
 * History (wipe), Realtime (Socket.IO `/v1/voice`).
 * HealthController is non-/v1 (see main.ts).
 *
 * Throttle note: default ThrottlerGuard keys by IP. AGENTS.md §6 wants
 * session-create 10/min, voice turns 20/min, history delete 5/min **per user** —
 * named limits are wired; true per-user getTracker is deferred (no Redis in MVP).
 * WS finals use an in-memory per-user counter in VoiceGateway (same 20/min).
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Monorepo root `.env` then optional `apps/api/.env` (latter wins).
      envFilePath: [
        resolve(__dirname, "../../../.env"),
        resolve(__dirname, "../.env"),
      ],
    }),
    // Named throttles: default; auth; sessionCreate; voiceTurn; historyDelete.
    ThrottlerModule.forRoot([
      {
        name: "default",
        ttl: 60_000,
        limit: 60,
      },
      {
        name: "auth",
        ttl: 60_000,
        limit: 10,
      },
      {
        name: "sessionCreate",
        ttl: 60_000,
        limit: 10,
      },
      {
        name: "voiceTurn",
        ttl: 60_000,
        limit: 20,
      },
      {
        name: "historyDelete",
        ttl: 60_000,
        limit: 5,
      },
    ]),
    PrismaModule,
    UsersModule,
    AuthModule,
    PersonasModule,
    SessionsModule,
    AiModule,
    SafetyModule,
    MemoryModule,
    HistoryModule,
    TurnsModule,
    RealtimeModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
