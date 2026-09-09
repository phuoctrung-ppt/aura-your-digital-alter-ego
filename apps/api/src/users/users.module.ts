import { Module } from "@nestjs/common";
import { UsersService } from "./users.service";

/**
 * Users module — persistence helpers for Auth.
 * PrismaModule is @Global; no explicit import required.
 */
@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
