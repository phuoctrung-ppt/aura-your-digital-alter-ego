/**
 * Nest TestingModule bootstrap helpers for e2e specs (M12).
 *
 * Mirrors main.ts: global `v1` prefix (exclude /health), HttpEnvelopeExceptionFilter, CORS.
 * Real Postgres + AI_PROVIDER_MODE=fake (from setup-e2e.ts).
 */

import { RequestMethod, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import { AppModule } from "../../src/app.module";
import { HttpEnvelopeExceptionFilter } from "../../src/common";
import { PrismaService } from "../../src/prisma/prisma.service";

export type TestAppContext = {
  app: INestApplication;
  /** Raw Node HTTP server for supertest / socket.io-client. */
  httpServer: ReturnType<INestApplication["getHttpServer"]>;
  prisma: PrismaService;
};

/**
 * Boot a full Nest app against real Postgres + fake AI providers.
 * Raises named throttle limits so suites do not flake on auth/session/turn caps.
 */
export async function createTestApp(): Promise<TestAppContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideModule(ThrottlerModule)
    .useModule(
      ThrottlerModule.forRoot([
        { name: "default", ttl: 60_000, limit: 10_000 },
        { name: "auth", ttl: 60_000, limit: 10_000 },
        { name: "sessionCreate", ttl: 60_000, limit: 10_000 },
        { name: "voiceTurn", ttl: 60_000, limit: 10_000 },
        { name: "historyDelete", ttl: 60_000, limit: 10_000 },
      ]),
    )
    .compile();

  const app = moduleRef.createNestApplication();

  app.setGlobalPrefix("v1", {
    exclude: [
      { path: "health", method: RequestMethod.GET },
      { path: "/", method: RequestMethod.GET },
    ],
  });
  app.useGlobalFilters(new HttpEnvelopeExceptionFilter());
  app.enableCors({ origin: true, credentials: true });

  await app.init();

  const prisma = app.get(PrismaService);
  return { app, httpServer: app.getHttpServer(), prisma };
}

/** Tear down Nest app + Prisma after a suite / test. */
export async function closeTestApp(ctx: TestAppContext): Promise<void> {
  await ctx.app.close();
}

/**
 * Best-effort truncate of user-scoped rows between tests.
 * Keeps global Persona catalog intact.
 */
export async function truncateUserScopedData(
  prisma: PrismaService,
): Promise<void> {
  // FK-safe order: turns → sessions → memory → safety → refresh → users
  await prisma.turn.deleteMany();
  await prisma.session.deleteMany();
  await prisma.memoryItem.deleteMany();
  await prisma.safetyEvent.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}
