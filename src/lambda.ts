import 'reflect-metadata';
import serverlessExpress from '@codegenie/serverless-express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { Handler } from 'aws-lambda';
import express from 'express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

// Declared at MODULE scope (not inside the handler) so it survives across
// warm Lambda invocations - the NestJS app is bootstrapped once per cold
// start and reused for every subsequent request in the same execution
// environment, instead of paying DI-container/Prisma-connection init cost
// on every single invocation.
let cachedHandler: Handler | undefined;

async function bootstrap(): Promise<Handler> {
  const expressApp = express();
  const nestApp = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
    bufferLogs: true,
  });
  nestApp.useLogger(nestApp.get(Logger));
  // No browser-based frontend consumes this API yet (Phase 1) - open CORS
  // is for tooling (Swagger UI, Postman-in-browser) rather than a specific
  // origin. Revisit once a real frontend origin exists to lock this down.
  nestApp.enableCors();
  await nestApp.init();
  return serverlessExpress({ app: expressApp });
}

export const handler: Handler = async (event, context, callback) => {
  cachedHandler ??= await bootstrap();
  return cachedHandler(event, context, callback);
};
