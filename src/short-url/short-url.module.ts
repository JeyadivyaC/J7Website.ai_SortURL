import { Module } from '@nestjs/common';
import { PrismaShortUrlRepository } from './prisma-short-url.repository';
import { SHORT_URL_REPOSITORY } from './short-url.repository';
import { ShortUrlController } from './short-url.controller';
import { ShortUrlService } from './short-url.service';

@Module({
  controllers: [ShortUrlController],
  providers: [ShortUrlService, { provide: SHORT_URL_REPOSITORY, useClass: PrismaShortUrlRepository }],
})
export class ShortUrlModule {}
