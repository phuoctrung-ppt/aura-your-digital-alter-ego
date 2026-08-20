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

/**
 * Root application module.
 * Global: ConfigModule, named Throttler (`default` + `auth` + `sessionCreate` + `voiceTurn`),
 * ThrottlerGuard.
 * Feature: Prisma, Users, Auth, Personas, Sessions, Ai, Safety, Turns, Memory.
 * HealthController is non-/v1 (see main.ts).
 *
 * Throttle note: default ThrottlerGuard keys by IP. AGENTS.md §6 wants
 * session-create 10/min and voice turns 20/min **per user** — named limits are
 * wired; true per-user getTracker is deferred (no Redis in MVP).
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
    // Named throttles: default; auth; sessionCreate; voiceTurn (20 turns/min).
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
    ]),
    PrismaModule,
    UsersModule,
    AuthModule,
    PersonasModule,
    SessionsModule,
    AiModule,
    SafetyModule,
    MemoryModule,
    TurnsModule,
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
