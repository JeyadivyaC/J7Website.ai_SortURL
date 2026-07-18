import { Injectable } from '@nestjs/common';
import { Env, validateEnv } from './env.schema';

@Injectable()
export class ConfigService {
  private readonly env: Env;

  constructor() {
    this.env = validateEnv(process.env);
  }

  get nodeEnv(): Env['NODE_ENV'] {
    return this.env.NODE_ENV;
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  get baseUrl(): string {
    return this.env.BASE_URL;
  }

  get databaseUrlFallback(): string | undefined {
    return this.env.DATABASE_URL;
  }

  get secretName(): string | undefined {
    return this.env.SECRET_NAME;
  }

  get logLevel(): string {
    return this.env.LOG_LEVEL ?? (this.isProduction ? 'info' : 'debug');
  }
}
