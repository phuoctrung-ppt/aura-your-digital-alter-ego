import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SessionsController } from "./sessions.controller";
import { SessionsService } from "./sessions.service";

/**
 * Sessions module — user-scoped session lifecycle (no turns/memory/AI yet).
 * PrismaModule is @Global; AuthModule supplies JwtAuthGuard / Passport JWT.
 * Kept independent of PersonasModule for scaffold; backend-worker may import
 * PersonasModule later if create needs catalog helpers.
 */
@Module({
  imports: [AuthModule],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
