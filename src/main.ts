import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

// Local development bootstrap only (`npm run start:dev`). The Lambda
// deployment uses src/lambda.ts instead - this Express server is never
// invoked in AWS.
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  // No browser-based frontend consumes this API yet (Phase 1) - open CORS
  // is for tooling (Swagger UI, Postman-in-browser) rather than a specific
  // origin. Revisit once a real frontend origin exists to lock this down.
  app.enableCors();

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}

void bootstrap();
