import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { PrismaModule } from "./prisma/prisma.module";

/**
 * Root application module.
 * M1: health + Prisma. Auth, personas, sessions, memory, AI modules land later.
 */
@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
