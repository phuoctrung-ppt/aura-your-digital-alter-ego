import { Controller, Get } from "@nestjs/common";

/**
 * Health probe — public.
 * Response matches AGENTS.md §15 envelope: { data, error }.
 */
@Controller()
export class HealthController {
  @Get()
  root() {
    return this.health();
  }

  @Get("health")
  health() {
    return {
      data: {
        ok: true as const,
        service: "aura-api" as const,
      },
      error: null,
    };
  }
}
