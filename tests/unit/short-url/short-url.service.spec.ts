import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '../../../src/config/config.service';
import { RequestContext } from '../../../src/common/http/request-context';
import { ShortCodeCollisionError } from '../../../src/common/errors/short-code-collision.error';
import { ShortCodeGenerationError } from '../../../src/common/errors/short-code-generation.error';
import { ShortUrlNotFoundError } from '../../../src/common/errors/short-url-not-found.error';
import { ShortUrl, ShortUrlRepository } from '../../../src/short-url/short-url.repository';
import { ShortUrlService } from '../../../src/short-url/short-url.service';

function createShortUrl(overrides: Partial<ShortUrl> = {}): ShortUrl {
  return {
    id: 'id-1',
    code: 'Ab12Cd',
    destination: 'https://example.com',
    clickCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastAccessedAt: null,
    expiresAt: null,
    createdBy: null,
    status: 'ACTIVE',
    ...overrides,
  };
}

function createRepository(overrides: Partial<ShortUrlRepository> = {}): ShortUrlRepository {
  return {
    create: jest.fn(),
    findByCode: jest.fn(),
    recordClick: jest.fn(),
    findExistingCodes: jest.fn().mockResolvedValue(new Set()),
    createMany: jest.fn(),
    findClickLogs: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function createRequestContext(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    ipAddress: '203.0.113.5',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    referer: 'https://example.com',
    httpMethod: 'GET',
    requestPath: '/r/Ab12Cd',
    queryString: '',
    requestId: 'req-123',
    country: null,
    region: null,
    city: null,
    ...overrides,
  };
}

describe('ShortUrlService', () => {
  const config = { baseUrl: 'https://api.example.com' } as unknown as ConfigService;

  describe('create', () => {
    it('creates a short URL and builds shortUrl from BASE_URL as "${baseUrl}/r/{code}"', async () => {
      const created = createShortUrl();
      const repository = createRepository({ create: jest.fn().mockResolvedValue(created) });
      const service = new ShortUrlService(repository, config);

      const result = await service.create('https://example.com');

      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        id: created.id,
        code: created.code,
        shortUrl: `https://api.example.com/r/${created.code}`,
      });
    });

    it('retries with a freshly generated code on collision and succeeds', async () => {
      const created = createShortUrl();
      const create = jest
        .fn()
        .mockRejectedValueOnce(new ShortCodeCollisionError('a'))
        .mockRejectedValueOnce(new ShortCodeCollisionError('b'))
        .mockResolvedValueOnce(created);
      const repository = createRepository({ create });
      const service = new ShortUrlService(repository, config);

      const result = await service.create('https://example.com');

      expect(create).toHaveBeenCalledTimes(3);
      expect(result.code).toBe(created.code);
    });

    it('throws ShortCodeGenerationError after exhausting all 5 retry attempts', async () => {
      const create = jest.fn().mockRejectedValue(new ShortCodeCollisionError('x'));
      const repository = createRepository({ create });
      const service = new ShortUrlService(repository, config);

      await expect(service.create('https://example.com')).rejects.toThrow(ShortCodeGenerationError);
      expect(create).toHaveBeenCalledTimes(5);
    });

    it('propagates unexpected repository errors immediately without retrying', async () => {
      const create = jest.fn().mockRejectedValue(new Error('db is down'));
      const repository = createRepository({ create });
      const service = new ShortUrlService(repository, config);

      await expect(service.create('https://example.com')).rejects.toThrow('db is down');
      expect(create).toHaveBeenCalledTimes(1);
    });
  });

  describe('createBulk', () => {
    it('generates one unique code per item and writes them in a single batch', async () => {
      const findExistingCodes = jest.fn().mockResolvedValue(new Set());
      const createMany = jest.fn().mockResolvedValue(3);
      const repository = createRepository({ findExistingCodes, createMany });
      const service = new ShortUrlService(repository, config);
      const items = [
        { destination: 'https://example.com/1' },
        { destination: 'https://example.com/2', createdBy: 'patient:42' },
        { destination: 'https://example.com/3' },
      ];

      const result = await service.createBulk(items);

      expect(findExistingCodes).toHaveBeenCalledTimes(1);
      expect(createMany).toHaveBeenCalledTimes(1);
      const entries = createMany.mock.calls[0][0];
      expect(entries).toHaveLength(3);
      expect(new Set(entries.map((entry: { code: string }) => entry.code)).size).toBe(3);
      expect(entries[0].destination).toBe('https://example.com/1');
      expect(entries[1].createdBy).toBe('patient:42');
      expect(result.created).toBe(3);
      expect(result.results).toEqual([
        { destination: 'https://example.com/1', code: entries[0].code, shortUrl: `https://api.example.com/r/${entries[0].code}`, createdBy: undefined },
        {
          destination: 'https://example.com/2',
          code: entries[1].code,
          shortUrl: `https://api.example.com/r/${entries[1].code}`,
          createdBy: 'patient:42',
        },
        { destination: 'https://example.com/3', code: entries[2].code, shortUrl: `https://api.example.com/r/${entries[2].code}`, createdBy: undefined },
      ]);
    });

    it('regenerates only the codes that collide with existing ones, then retries', async () => {
      const findExistingCodes = jest
        .fn()
        .mockImplementationOnce((codes: string[]) => Promise.resolve(new Set([codes[0]])))
        .mockResolvedValueOnce(new Set());
      const createMany = jest.fn().mockResolvedValue(2);
      const repository = createRepository({ findExistingCodes, createMany });
      const service = new ShortUrlService(repository, config);

      const result = await service.createBulk([{ destination: 'https://example.com/1' }, { destination: 'https://example.com/2' }]);

      expect(findExistingCodes).toHaveBeenCalledTimes(2);
      const [firstAttemptCodes] = findExistingCodes.mock.calls[0];
      const [secondAttemptCodes] = findExistingCodes.mock.calls[1];
      expect(secondAttemptCodes).toHaveLength(firstAttemptCodes.length);
      expect(createMany).toHaveBeenCalledTimes(1);
      expect(result.created).toBe(2);
      expect(result.results).toHaveLength(2);
    });

    it('throws ShortCodeGenerationError after exhausting all 5 collision-check attempts', async () => {
      const findExistingCodes = jest.fn().mockImplementation((codes: string[]) => Promise.resolve(new Set(codes)));
      const repository = createRepository({ findExistingCodes });
      const service = new ShortUrlService(repository, config);

      await expect(service.createBulk([{ destination: 'https://example.com/1' }])).rejects.toThrow(
        ShortCodeGenerationError,
      );
      expect(findExistingCodes).toHaveBeenCalledTimes(5);
    });
  });

  describe('getStats', () => {
    it('returns the short URL details plus its click log, built from a found record', async () => {
      const found = createShortUrl({
        clickCount: 1,
        lastAccessedAt: new Date('2026-07-18T11:56:51.000Z'),
      });
      const clickLog = {
        clickedAt: new Date('2026-07-18T11:56:51.000Z'),
        ipAddress: '203.0.113.5',
        userAgent: 'test-agent',
        referer: '',
        country: null,
        region: null,
        city: null,
        deviceType: 'desktop',
        browser: 'Chrome',
        operatingSystem: 'Windows',
        isBot: false,
        responseStatus: 302,
        redirectUrl: found.destination,
      };
      const findByCode = jest.fn().mockResolvedValue(found);
      const findClickLogs = jest.fn().mockResolvedValue([clickLog]);
      const repository = createRepository({ findByCode, findClickLogs });
      const service = new ShortUrlService(repository, config);

      const result = await service.getStats(found.code);

      expect(findByCode).toHaveBeenCalledWith(found.code);
      expect(findClickLogs).toHaveBeenCalledWith(found.code, 50);
      expect(result).toEqual({
        id: found.id,
        code: found.code,
        destination: found.destination,
        shortUrl: `https://api.example.com/r/${found.code}`,
        clickCount: found.clickCount,
        createdAt: found.createdAt,
        lastAccessedAt: found.lastAccessedAt,
        expiresAt: found.expiresAt,
        status: found.status,
        clicks: [clickLog],
      });
    });

    it('throws ShortUrlNotFoundError when the code does not exist, without querying click logs', async () => {
      const findClickLogs = jest.fn();
      const repository = createRepository({ findByCode: jest.fn().mockResolvedValue(null), findClickLogs });
      const service = new ShortUrlService(repository, config);

      await expect(service.getStats('missing')).rejects.toThrow(ShortUrlNotFoundError);
      expect(findClickLogs).not.toHaveBeenCalled();
    });
  });

  describe('redirect', () => {
    it('parses click metadata from the request context and records the click', async () => {
      const found = createShortUrl({ clickCount: 5 });
      const recordClick = jest.fn().mockResolvedValue(found);
      const repository = createRepository({ recordClick });
      const service = new ShortUrlService(repository, config);
      const context = createRequestContext();

      const result = await service.redirect(found.code, context);

      expect(recordClick).toHaveBeenCalledWith(found.code, {
        ...context,
        deviceType: 'desktop',
        browser: 'Chrome',
        operatingSystem: 'Windows',
        isBot: false,
        responseStatus: HttpStatus.FOUND,
      });
      expect(result).toBe(found);
    });

    it('passes CloudFront-derived geolocation through unchanged', async () => {
      const found = createShortUrl();
      const recordClick = jest.fn().mockResolvedValue(found);
      const repository = createRepository({ recordClick });
      const service = new ShortUrlService(repository, config);
      const context = createRequestContext({ country: 'IN', region: 'Tamil Nadu', city: 'Chennai' });

      await service.redirect(found.code, context);

      expect(recordClick).toHaveBeenCalledWith(
        found.code,
        expect.objectContaining({ country: 'IN', region: 'Tamil Nadu', city: 'Chennai' }),
      );
    });

    it('flags a known bot user agent as isBot', async () => {
      const found = createShortUrl();
      const recordClick = jest.fn().mockResolvedValue(found);
      const repository = createRepository({ recordClick });
      const service = new ShortUrlService(repository, config);
      const context = createRequestContext({
        userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      });

      await service.redirect(found.code, context);

      expect(recordClick).toHaveBeenCalledWith(found.code, expect.objectContaining({ isBot: true }));
    });

    it('propagates ShortUrlNotFoundError when the code does not exist', async () => {
      const repository = createRepository({
        recordClick: jest.fn().mockRejectedValue(new ShortUrlNotFoundError('missing')),
      });
      const service = new ShortUrlService(repository, config);

      await expect(service.redirect('missing', createRequestContext())).rejects.toThrow(ShortUrlNotFoundError);
    });
  });
});
