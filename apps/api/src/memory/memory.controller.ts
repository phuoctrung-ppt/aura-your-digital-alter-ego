import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import {
  MemoryListQuerySchema,
  type MemoryListQuery,
} from "@aura/contracts";
import { CurrentUser, ZodValidationPipe, type AuthUser } from "../common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { MemoryService } from "./memory.service";

/**
 * Memory HTTP surface under `/v1/memory`.
 */
@ApiTags("memory")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("memory")
export class MemoryController {
  constructor(private readonly memory: MemoryService) {}

  /** GET /v1/memory — protected → MemoryListResponse */
  @Get()
  @ApiOperation({ summary: "List caller's memory items (cursor pagination)" })
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(MemoryListQuerySchema))
    query: MemoryListQuery,
  ) {
    return this.memory.listForUser(user.userId, query);
  }
}
