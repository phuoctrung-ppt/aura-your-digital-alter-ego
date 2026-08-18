import 'reflect-metadata'; 
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  // Intentionally no console secrets; startup line is fine for local stub.
  // eslint-disable-next-line no-console
  console.log(`Application aura-api listening on http://0.0.0.0:${port}`);
}

void bootstrap();
