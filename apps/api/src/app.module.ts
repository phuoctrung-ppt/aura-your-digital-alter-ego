import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { resolve } from "path";
import { AuthModule } from "./auth/auth.module";
import { HealthController } from "./health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { UsersModule } from "./users/users.module";

/**
 * Root application module.
 * Global: ConfigModule, named Throttler (`default` + `auth`), ThrottlerGuard.
 * Feature: Prisma, Users, Auth. HealthController is non-/v1 (see main.ts).
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
    // Named throttles: default for general routes; auth for login/register/refresh.
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
    ]),
    PrismaModule,
    UsersModule,
    AuthModule,
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
