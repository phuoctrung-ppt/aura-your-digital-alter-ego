import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import {
  accessTtlSec,
  AuthSecrets,
  requireAccessSecret,
  requireRefreshSecret,
} from "./auth-secrets";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { JwtStrategy } from "./strategies/jwt.strategy";

/**
 * Auth module — JWT access + rotating refresh.
 * Throttling is configured globally in AppModule (named "auth" throttle).
 *
 * TTL overrides (optional):
 *   JWT_ACCESS_TTL_SEC  — default 900 (15m)
 *   JWT_REFRESH_TTL_SEC — default 604800 (7d)
 *
 * Boot fails in non-test if JWT_ACCESS_SECRET / JWT_REFRESH_SECRET missing/empty.
 */
@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: requireAccessSecret(config),
        signOptions: { expiresIn: accessTtlSec(config) },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthSecrets, JwtStrategy, JwtAuthGuard],
  exports: [AuthService, AuthSecrets, JwtAuthGuard, JwtModule, PassportModule],
})
export class AuthModule implements OnModuleInit {
  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    // Fail boot clearly when secrets are unset (test env allows fallbacks).
    requireAccessSecret(this.config);
    requireRefreshSecret(this.config);
  }
}
