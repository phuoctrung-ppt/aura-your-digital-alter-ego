import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { resolve } from "path";
import { AuthModule } from "./auth/auth.module";
import { HealthController } from "./health.controller";
import { PersonasModule } from "./personas/personas.module";
import { PrismaModule } from "./prisma/prisma.module";
import { SessionsModule } from "./sessions/sessions.module";
import { UsersModule } from "./users/users.module";

/**
 * Root application module.
 * Global: ConfigModule, named Throttler (`default` + `auth` + `sessionCreate`),
 * ThrottlerGuard.
 * Feature: Prisma, Users, Auth, Personas, Sessions.
 * HealthController is non-/v1 (see main.ts).
 *
 * Throttle note: default ThrottlerGuard keys by IP. AGENTS.md §6 wants
 * session-create 10/min **per user** — named limit is wired; true per-user
 * getTracker is deferred (no Redis in MVP).
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
    // Named throttles: default; auth (login/register/refresh); sessionCreate.
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
    ]),
    PrismaModule,
    UsersModule,
    AuthModule,
    PersonasModule,
    SessionsModule,
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
