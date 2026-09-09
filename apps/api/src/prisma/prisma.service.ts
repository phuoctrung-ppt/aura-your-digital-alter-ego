import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * Thin PrismaClient wrapper for Nest DI.
 * M1 scaffold — database-worker / backend-worker may extend logging, middleware.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    // Connect lazily-friendly: still call $connect so boot fails fast if DATABASE_URL is wrong.
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
