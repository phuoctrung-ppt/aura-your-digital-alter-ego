import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";

/**
 * Root application module.
 * M0: health only. Auth, personas, sessions, memory, AI modules land later.
 */
@Module({
  imports: [],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
