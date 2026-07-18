import { Global, Module } from '@nestjs/common';
import { SecretsService } from '../../config/secrets.service';
import { PrismaService } from './prisma.service';

// PrismaService is created via an async factory because the connection URL
// itself must be resolved asynchronously (Secrets Manager on cold start, or
// DATABASE_URL locally) before the Prisma client can be constructed - see
// SecretsService for the resolution + caching rule.
@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      useFactory: async (secrets: SecretsService) => {
        const databaseUrl = await secrets.getDatabaseUrl();
        return new PrismaService(databaseUrl);
      },
      inject: [SecretsService],
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
