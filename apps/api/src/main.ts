import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { HttpEnvelopeExceptionFilter } from "./common";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Product API under /v1/*; health probes stay non-versioned (contract).
  app.setGlobalPrefix("v1", {
    exclude: [
      { path: "health", method: RequestMethod.GET },
      { path: "/", method: RequestMethod.GET },
    ],
  });

  // Envelope filter — maps exceptions to { data: null, error }.
  app.useGlobalFilters(new HttpEnvelopeExceptionFilter());

  const nodeEnv = (config.get<string>("NODE_ENV") ?? "development").trim();
  if (nodeEnv === "production") {
    const rawOrigins = config.getOrThrow<string>("CORS_ORIGINS");
    const origins = rawOrigins
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
    if (origins.length === 0) {
      throw new Error(
        "CORS_ORIGINS is required in production (comma-separated allowlist)",
      );
    }
    app.enableCors({
      origin: origins,
      credentials: true,
    });
  } else {
    // Reflect request Origin in non-production (Expo / local web tools).
    app.enableCors({
      origin: true,
      credentials: true,
    });
  }

  if (nodeEnv !== "production") {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Aura API")
      .setDescription("Aura NestJS API — auth, sessions, personas, memory")
      .setVersion("0.0.0")
      .addBearerAuth(
        {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "JWT access token from /v1/auth/login or /v1/auth/register",
        },
        "bearer",
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("docs", app, document, {
      useGlobalPrefix: false,
    });
  }

  const port = Number(config.get<string>("PORT") ?? 3000);
  await app.listen(port, "0.0.0.0");

  // Intentionally no secrets in startup logs.
  // eslint-disable-next-line no-console
  console.log(`Application aura-api listening on http://0.0.0.0:${port}`);
  if (nodeEnv !== "production") {
    // eslint-disable-next-line no-console
    console.log(`Swagger UI available at http://0.0.0.0:${port}/docs`);
  }
}

void bootstrap();
