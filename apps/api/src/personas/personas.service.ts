import {
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import {
  ErrorCodes,
  ok,
  type Persona,
  type PersonaListResponse,
  type PersonaSlug,
} from "@aura/contracts";
import type { Persona as PrismaPersona, PersonaGroup } from "@prisma/client";
import { AppLogger } from "../common";
import { PrismaService } from "../prisma/prisma.service";

/** MVP catalog size — seed must provide exactly these two personas. */
const MVP_PERSONA_COUNT = 2;

/**
 * Personas catalog service — global MVP catalog (not user-scoped).
 * Never returns `systemPromptText` (server-side only).
 */
@Injectable()
export class PersonasService {
  private readonly logger = new AppLogger(PersonasService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * List MVP personas (exactly 2). Never returns system prompt text.
   * Missing / wrong seed → 500 INTERNAL_ERROR (do not invent fake personas).
   */
  async list(): Promise<PersonaListResponse> {
    const rows = await this.prisma.persona.findMany({
      orderBy: { slug: "asc" },
      select: {
        slug: true,
        name: true,
        description: true,
        group: true,
        avatarAssetKey: true,
        systemPromptVersion: true,
      },
    });

    if (rows.length !== MVP_PERSONA_COUNT) {
      this.logger.error(
        `persona catalog count=${rows.length} expected=${MVP_PERSONA_COUNT} — seed missing or corrupt`,
      );
      throw new InternalServerErrorException({
        code: ErrorCodes.INTERNAL_ERROR,
        message: "Persona catalog unavailable",
      });
    }

    const items: Persona[] = rows.map((row) => this.toPersonaDto(row));
    return ok({ items });
  }

  private toPersonaDto(
    row: Pick<
      PrismaPersona,
      | "slug"
      | "name"
      | "description"
      | "group"
      | "avatarAssetKey"
      | "systemPromptVersion"
    >,
  ): Persona {
    return {
      slug: row.slug as PersonaSlug,
      name: row.name,
      description: row.description,
      group: this.mapGroup(row.group),
      avatarAssetKey: row.avatarAssetKey,
      systemPromptVersion: row.systemPromptVersion,
    };
  }

  private mapGroup(group: PersonaGroup): Persona["group"] {
    // Prisma enum values match contract enum (interview | language).
    return group;
  }
}
