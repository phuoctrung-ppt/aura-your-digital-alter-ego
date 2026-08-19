import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { ok, type HealthData } from "@aura/contracts";

/**
 * Health probe — public, non-versioned (`GET /health`, `GET /`).
 * Excluded from global `/v1` prefix in main.ts.
 * Response matches AGENTS.md §15 envelope via contracts `ok()`.
 */
@ApiTags("health")
@SkipThrottle()
@Controller()
export class HealthController {
  @Get()
  @ApiOperation({ summary: "Root health probe" })
  root() {
    return this.health();
  }

  @Get("health")
  @ApiOperation({ summary: "Health probe" })
  health() {
    const data: HealthData = {
      ok: true,
      service: "aura-api",
    };
    return ok(data);
  }
}
