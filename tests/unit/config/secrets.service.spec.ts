import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { ConfigService } from '../../../src/config/config.service';
import { SecretsService } from '../../../src/config/secrets.service';

function createConfig(overrides: { secretName?: string; databaseUrlFallback?: string }): ConfigService {
  return {
    secretName: overrides.secretName,
    databaseUrlFallback: overrides.databaseUrlFallback,
  } as unknown as ConfigService;
}

function createClient(): { send: jest.Mock } & SecretsManagerClient {
  return { send: jest.fn() } as unknown as { send: jest.Mock } & SecretsManagerClient;
}

describe('SecretsService', () => {
  it('falls back to DATABASE_URL without calling Secrets Manager when SECRET_NAME is unset', async () => {
    const client = createClient();
    const config = createConfig({ databaseUrlFallback: 'mongodb://user:pass@localhost:27017/db' });
    const service = new SecretsService(config, client);

    const url = await service.getDatabaseUrl();

    expect(client.send).not.toHaveBeenCalled();
    expect(url).toContain('mongodb://user:pass@localhost:27017/db');
  });

  it('fetches from Secrets Manager and caches the result when SECRET_NAME is set', async () => {
    const client = createClient();
    client.send.mockResolvedValue({
      SecretString: JSON.stringify({
        host: 'db.internal',
        port: 27017,
        username: 'j7website',
        password: 'p@ss/w?rd',
        dbname: 'j7website_short_url',
      }),
    });
    const config = createConfig({ secretName: 'j7website/short-url/dev' });
    const service = new SecretsService(config, client);

    const first = await service.getDatabaseUrl();
    const second = await service.getDatabaseUrl();

    expect(client.send).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(first).toContain('db.internal');
    expect(first).toContain('j7website_short_url');
  });

  it('builds a connection string directly from a "connectionString" field when present (e.g. Atlas SRV)', async () => {
    const client = createClient();
    client.send.mockResolvedValue({
      SecretString: JSON.stringify({
        connectionString: 'mongodb+srv://user:pass@cluster0.mongodb.net/j7website?retryWrites=true&w=majority',
      }),
    });
    const config = createConfig({ secretName: 'j7website/short-url/dev' });
    const service = new SecretsService(config, client);

    const url = await service.getDatabaseUrl();

    expect(url).toContain('mongodb+srv://user:pass@cluster0.mongodb.net/j7website');
    expect(url).toContain('maxPoolSize=1');
  });

  it('throws when neither SECRET_NAME nor DATABASE_URL is set', async () => {
    const client = createClient();
    const config = createConfig({});
    const service = new SecretsService(config, client);

    await expect(service.getDatabaseUrl()).rejects.toThrow();
    expect(client.send).not.toHaveBeenCalled();
  });
});
