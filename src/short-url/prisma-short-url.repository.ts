import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ShortCodeCollisionError } from '../common/errors/short-code-collision.error';
import { ShortUrlNotFoundError } from '../common/errors/short-url-not-found.error';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import {
  BulkCreateShortUrlData,
  ClickLogInput,
  ClickLogRecord,
  CreateShortUrlData,
  ShortUrl,
  ShortUrlRepository,
} from './short-url.repository';

const PRISMA_UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
const PRISMA_RECORD_NOT_FOUND = 'P2025';

// Prisma's interactive-transaction default (5000ms) leaves too little
// headroom against a cold Lambda + cross-region round trip to the MongoDB
// deployment - observed failing at ~5001ms in practice (P2028, "Transaction
// already closed"). Comfortably under the Lambda's own 15s function timeout
// (template.yaml) so a genuinely stuck transaction still fails well before
// Lambda force-kills the invocation.
const RECORD_CLICK_TRANSACTION_TIMEOUT_MS = 10_000;

@Injectable()
export class PrismaShortUrlRepository implements ShortUrlRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateShortUrlData): Promise<ShortUrl> {
    try {
      return await this.prisma.shortUrl.create({
        data: {
          code: data.code,
          destination: data.destination,
          createdBy: data.createdBy,
          expiresAt: data.expiresAt,
        },
      });
    } catch (error) {
      if (this.isPrismaError(error, PRISMA_UNIQUE_CONSTRAINT_VIOLATION)) {
        throw new ShortCodeCollisionError(data.code);
      }
      throw error;
    }
  }

  async findByCode(code: string): Promise<ShortUrl | null> {
    return this.prisma.shortUrl.findUnique({ where: { code } });
  }

  async recordClick(code: string, clickLog: ClickLogInput): Promise<ShortUrl> {
    try {
      // A real multi-document transaction: the click_count/last_accessed_at
      // update and the short_url_click_logs insert must be all-or-nothing,
      // so this can no longer be the single atomic `update` the audit-free
      // version used (see docs/architecture.md). Prisma auto-rolls-back the
      // whole transaction if anything inside throws, so a not-found on the
      // update (P2025) means no click log gets written either.
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.shortUrl.update({
          where: { code },
          data: {
            clickCount: { increment: 1 },
            lastAccessedAt: new Date(),
          },
        });

        await tx.shortUrlClickLog.create({
          data: {
            shortUrlId: updated.id,
            code,
            redirectUrl: updated.destination,
            ...clickLog,
          },
        });

        return updated;
      }, { timeout: RECORD_CLICK_TRANSACTION_TIMEOUT_MS });
    } catch (error) {
      if (this.isPrismaError(error, PRISMA_RECORD_NOT_FOUND)) {
        throw new ShortUrlNotFoundError(code);
      }
      throw error;
    }
  }

  async findExistingCodes(codes: string[]): Promise<Set<string>> {
    const existing = await this.prisma.shortUrl.findMany({
      where: { code: { in: codes } },
      select: { code: true },
    });
    return new Set(existing.map((row) => row.code));
  }

  async createMany(entries: BulkCreateShortUrlData[]): Promise<number> {
    const result = await this.prisma.shortUrl.createMany({
      data: entries.map((entry) => ({
        code: entry.code,
        destination: entry.destination,
        createdBy: entry.createdBy,
      })),
    });
    return result.count;
  }

  async findClickLogs(code: string, limit: number): Promise<ClickLogRecord[]> {
    return this.prisma.shortUrlClickLog.findMany({
      where: { code },
      orderBy: { clickedAt: 'desc' },
      take: limit,
      select: {
        clickedAt: true,
        ipAddress: true,
        userAgent: true,
        referer: true,
        country: true,
        region: true,
        city: true,
        deviceType: true,
        browser: true,
        operatingSystem: true,
        isBot: true,
        responseStatus: true,
        redirectUrl: true,
      },
    });
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
  }
}
