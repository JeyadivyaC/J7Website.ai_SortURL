import { Prisma } from '@prisma/client';
import { ShortCodeCollisionError } from '../../../src/common/errors/short-code-collision.error';
import { ShortUrlNotFoundError } from '../../../src/common/errors/short-url-not-found.error';
import { PrismaService } from '../../../src/infrastructure/prisma/prisma.service';
import { PrismaShortUrlRepository } from '../../../src/short-url/prisma-short-url.repository';
import { ClickLogInput } from '../../../src/short-url/short-url.repository';

function prismaKnownError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('mock prisma error', {
    code,
    clientVersion: 'test',
  });
}

function createPrismaMock(
  shortUrlOverrides: Partial<Record<'create' | 'findUnique' | 'update' | 'findMany' | 'createMany', jest.Mock>> = {},
  clickLogOverrides: Partial<Record<'create' | 'findMany', jest.Mock>> = {},
) {
  const shortUrl = {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    createMany: jest.fn(),
    ...shortUrlOverrides,
  };
  const shortUrlClickLog = {
    create: jest.fn(),
    findMany: jest.fn(),
    ...clickLogOverrides,
  };
  const tx = { shortUrl, shortUrlClickLog };

  return {
    shortUrl,
    shortUrlClickLog,
    // Interactive transaction mock: just invokes the callback with the same
    // mocked collections, since PrismaShortUrlRepository only ever calls
    // tx.shortUrl / tx.shortUrlClickLog - no real Mongo session needed here.
    $transaction: jest.fn(
      (callback: (transactionClient: typeof tx) => unknown, _options?: { timeout: number }) => callback(tx),
    ),
  } as unknown as PrismaService;
}

function createClickLog(overrides: Partial<ClickLogInput> = {}): ClickLogInput {
  return {
    ipAddress: '203.0.113.5',
    userAgent: 'test-agent',
    referer: '',
    httpMethod: 'GET',
    requestPath: '/r/abc123',
    queryString: '',
    country: null,
    region: null,
    city: null,
    deviceType: 'desktop',
    browser: 'Chrome',
    operatingSystem: 'Windows',
    isBot: false,
    responseStatus: 302,
    requestId: 'req-1',
    ...overrides,
  };
}

describe('PrismaShortUrlRepository', () => {
  describe('create', () => {
    it('translates a P2002 unique-constraint violation into ShortCodeCollisionError', async () => {
      const prisma = createPrismaMock({ create: jest.fn().mockRejectedValue(prismaKnownError('P2002')) });
      const repository = new PrismaShortUrlRepository(prisma);

      await expect(
        repository.create({ code: 'dupe01', destination: 'https://example.com' }),
      ).rejects.toThrow(ShortCodeCollisionError);
    });

    it('rethrows unrelated Prisma errors unchanged', async () => {
      const prisma = createPrismaMock({ create: jest.fn().mockRejectedValue(prismaKnownError('P2003')) });
      const repository = new PrismaShortUrlRepository(prisma);

      await expect(
        repository.create({ code: 'code01', destination: 'https://example.com' }),
      ).rejects.toThrow('mock prisma error');
    });
  });

  describe('recordClick', () => {
    it('translates a P2025 not-found into ShortUrlNotFoundError and writes no click log', async () => {
      const update = jest.fn().mockRejectedValue(prismaKnownError('P2025'));
      const create = jest.fn();
      const prisma = createPrismaMock({ update }, { create });
      const repository = new PrismaShortUrlRepository(prisma);

      await expect(repository.recordClick('missing', createClickLog())).rejects.toThrow(ShortUrlNotFoundError);
      expect(create).not.toHaveBeenCalled();
    });

    it('increments click_count/last_accessed_at and inserts one click log row in the same transaction', async () => {
      const updated = { id: '1', code: 'abc123', destination: 'https://example.com', clickCount: 1 };
      const update = jest.fn().mockResolvedValue(updated);
      const create = jest.fn().mockResolvedValue({});
      const prisma = createPrismaMock({ update }, { create });
      const repository = new PrismaShortUrlRepository(prisma);
      const clickLog = createClickLog();

      const result = await repository.recordClick('abc123', clickLog);

      expect(update).toHaveBeenCalledWith({
        where: { code: 'abc123' },
        data: { clickCount: { increment: 1 }, lastAccessedAt: expect.any(Date) },
      });
      expect(create).toHaveBeenCalledWith({
        data: { shortUrlId: updated.id, code: 'abc123', redirectUrl: updated.destination, ...clickLog },
      });
      expect(result).toBe(updated);
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 10_000 });
    });

    it('rethrows unrelated Prisma errors unchanged', async () => {
      const update = jest.fn().mockRejectedValue(prismaKnownError('P2003'));
      const prisma = createPrismaMock({ update });
      const repository = new PrismaShortUrlRepository(prisma);

      await expect(repository.recordClick('abc123', createClickLog())).rejects.toThrow('mock prisma error');
    });
  });

  describe('findByCode', () => {
    it('returns null when no record matches', async () => {
      const prisma = createPrismaMock({ findUnique: jest.fn().mockResolvedValue(null) });
      const repository = new PrismaShortUrlRepository(prisma);

      await expect(repository.findByCode('missing')).resolves.toBeNull();
    });
  });

  describe('findExistingCodes', () => {
    it('returns only the candidate codes that already exist, in one query', async () => {
      const findMany = jest.fn().mockResolvedValue([{ code: 'abc123' }]);
      const prisma = createPrismaMock({ findMany });
      const repository = new PrismaShortUrlRepository(prisma);

      const result = await repository.findExistingCodes(['abc123', 'def456']);

      expect(findMany).toHaveBeenCalledWith({
        where: { code: { in: ['abc123', 'def456'] } },
        select: { code: true },
      });
      expect(result).toEqual(new Set(['abc123']));
    });

    it('returns an empty set when none of the candidates exist', async () => {
      const prisma = createPrismaMock({ findMany: jest.fn().mockResolvedValue([]) });
      const repository = new PrismaShortUrlRepository(prisma);

      await expect(repository.findExistingCodes(['abc123'])).resolves.toEqual(new Set());
    });
  });

  describe('findClickLogs', () => {
    it('queries by code, newest first, capped at the given limit', async () => {
      const rows = [{ clickedAt: new Date(), ipAddress: '203.0.113.5' }];
      const findMany = jest.fn().mockResolvedValue(rows);
      const prisma = createPrismaMock({}, { findMany });
      const repository = new PrismaShortUrlRepository(prisma);

      const result = await repository.findClickLogs('abc123', 50);

      expect(findMany).toHaveBeenCalledWith({
        where: { code: 'abc123' },
        orderBy: { clickedAt: 'desc' },
        take: 50,
        select: expect.objectContaining({ clickedAt: true, ipAddress: true, redirectUrl: true }),
      });
      expect(result).toBe(rows);
    });
  });

  describe('createMany', () => {
    it('inserts every entry in a single batched write and returns the count', async () => {
      const createMany = jest.fn().mockResolvedValue({ count: 2 });
      const prisma = createPrismaMock({ createMany });
      const repository = new PrismaShortUrlRepository(prisma);
      const entries = [
        { code: 'abc123', destination: 'https://example.com/1' },
        { code: 'def456', destination: 'https://example.com/2', createdBy: 'patient:42' },
      ];

      const result = await repository.createMany(entries);

      expect(createMany).toHaveBeenCalledWith({ data: entries });
      expect(result).toBe(2);
    });
  });
});
