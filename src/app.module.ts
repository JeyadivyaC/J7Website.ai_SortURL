import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ConfigModule } from './config/config.module';
import { DocsModule } from './docs/docs.module';
import { HealthModule } from './health/health.module';
import { AppLoggerModule } from './infrastructure/logger/logger.module';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { ShortUrlModule } from './short-url/short-url.module';

@Module({
  imports: [ConfigModule, AppLoggerModule, PrismaModule, HealthModule, DocsModule, ShortUrlModule],
  providers: [{ provide: APP_FILTER, useClass: GlobalExceptionFilter }],
})
export class AppModule {}
