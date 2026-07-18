import { Inject, Injectable, Logger } from '@nestjs/common';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { ConfigService } from './config.service';

export const SECRETS_MANAGER_CLIENT = 'SECRETS_MANAGER_CLIENT';

interface DbSecretPayload {
  /** Preferred shape - required for SRV-style hosts (e.g. MongoDB Atlas). */
  connectionString?: string;
  /** Decomposed alternative for a single-host deployment; builds a plain "mongodb://" URI (not "+srv"). */
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  dbname?: string;
}

// Each Lambda execution environment handles at most one concurrent
// invocation, so a small pool per environment is enough; keeping it capped
// avoids many concurrent execution environments collectively opening far
// more connections than the external MongoDB deployment allows.
const DEFAULT_MAX_POOL_SIZE = 1;

/**
 * Resolves the Prisma DATABASE_URL (a MongoDB connection string) with the
 * following precedence:
 *   1. SECRET_NAME set -> fetch + parse the JSON secret from Secrets Manager.
 *   2. otherwise        -> fall back to DATABASE_URL (local dev).
 *
 * The resolved URL is memoized for the lifetime of this service instance.
 * Because the whole Nest application is cached at module scope across warm
 * Lambda invocations (see src/lambda.ts), this means Secrets Manager is
 * called at most once per cold start, not once per request.
 */
@Injectable()
export class SecretsService {
  private readonly logger = new Logger(SecretsService.name);
  private cachedDatabaseUrl: Promise<string> | undefined;

  constructor(
    private readonly config: ConfigService,
    @Inject(SECRETS_MANAGER_CLIENT) private readonly client: SecretsManagerClient,
  ) {}

  async getDatabaseUrl(): Promise<string> {
    if (!this.cachedDatabaseUrl) {
      this.cachedDatabaseUrl = this.resolveDatabaseUrl().catch((error: unknown) => {
        // Don't cache a rejection forever - let the next call retry.
        this.cachedDatabaseUrl = undefined;
        throw error;
      });
    }
    return this.cachedDatabaseUrl;
  }

  private async resolveDatabaseUrl(): Promise<string> {
    const secretName = this.config.secretName;
    if (secretName) {
      this.logger.log(`Resolving DATABASE_URL from Secrets Manager secret "${secretName}"`);
      return this.buildUrlFromSecret(secretName);
    }

    const fallback = this.config.databaseUrlFallback;
    if (fallback) {
      return this.withPoolParams(fallback);
    }

    throw new Error('No DATABASE_URL could be resolved: neither SECRET_NAME nor DATABASE_URL is set');
  }

  private async buildUrlFromSecret(secretName: string): Promise<string> {
    const response = await this.client.send(new GetSecretValueCommand({ SecretId: secretName }));
    if (!response.SecretString) {
      throw new Error(`Secret "${secretName}" has no SecretString payload`);
    }

    const payload = JSON.parse(response.SecretString) as DbSecretPayload;

    if (payload.connectionString) {
      return this.withPoolParams(payload.connectionString);
    }

    const { host, port, username, password, dbname } = payload;
    if (!host || !username || !password || !dbname) {
      throw new Error(
        `Secret "${secretName}" is missing required fields (expected "connectionString", or "host"/"username"/"password"/"dbname", with an optional "port")`,
      );
    }

    const encodedUser = encodeURIComponent(username);
    const encodedPassword = encodeURIComponent(password);
    const hostAndPort = port ? `${host}:${port}` : host;
    const url = `mongodb://${encodedUser}:${encodedPassword}@${hostAndPort}/${dbname}`;
    return this.withPoolParams(url);
  }

  private withPoolParams(rawUrl: string): string {
    const url = new URL(rawUrl);
    if (!url.searchParams.has('maxPoolSize')) {
      url.searchParams.set('maxPoolSize', String(DEFAULT_MAX_POOL_SIZE));
    }
    return url.toString();
  }
}
