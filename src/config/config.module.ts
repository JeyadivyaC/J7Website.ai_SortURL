import { Global, Module } from '@nestjs/common';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { ConfigService } from './config.service';
import { SECRETS_MANAGER_CLIENT, SecretsService } from './secrets.service';

@Global()
@Module({
  providers: [
    ConfigService,
    {
      provide: SECRETS_MANAGER_CLIENT,
      useFactory: () => new SecretsManagerClient({}),
    },
    SecretsService,
  ],
  exports: [ConfigService, SecretsService],
})
export class ConfigModule {}
