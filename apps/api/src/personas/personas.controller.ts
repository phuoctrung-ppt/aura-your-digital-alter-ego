import { Controller, Get, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser, type AuthUser } from "../common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PersonasService } from "./personas.service";

/**
 * Personas HTTP surface under `/v1/personas`.
 * Protected catalog read — client sends personaSlug only on session create.
 * Global prefix `v1` is applied in main.ts — routes here omit the version segment.
 */
@ApiTags("personas")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("personas")
export class PersonasController {
  constructor(private readonly personas: PersonasService) {}

  /** GET /v1/personas — protected → PersonaListResponse (exactly 2 MVP items) */
  @Get()
  @ApiOperation({ summary: "List MVP persona catalog" })
  async list(@CurrentUser() _user: AuthUser) {
    return this.personas.list();
  }
}
