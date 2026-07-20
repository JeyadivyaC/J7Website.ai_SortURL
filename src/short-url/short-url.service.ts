import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { RequestContext } from '../common/http/request-context';
import { ShortCodeCollisionError } from '../common/errors/short-code-collision.error';
import { ShortCodeGenerationError } from '../common/errors/short-code-generation.error';
import { ShortUrlNotFoundError } from '../common/errors/short-url-not-found.error';
import { parseClickMetadata } from './click-metadata';
import { generateBase62Code } from './code-generator';
import { ShortUrlBulkResponseDto } from './dto/short-url-bulk-response.dto';
import { ShortUrlClicksResponseDto } from './dto/short-url-clicks-response.dto';
import { ShortUrlResponseDto } from './dto/short-url-response.dto';
import { ShortUrlStatsResponseDto } from './dto/short-url-stats-response.dto';
import { SHORT_URL_REPOSITORY, ShortUrl, ShortUrlRepository } from './short-url.repository';

export interface BulkCreateItem {
  destination: string;
  createdBy?: string;
}

// Bounded retry on code collision (see docs/architecture.md for the birthday-
// bound math justifying 6-char Base62 codes + this retry count).
const MAX_CODE_GENERATION_ATTEMPTS = 5;

// Caps the click history returned by getStats - a heavily-clicked short URL
// could otherwise return an unbounded number of rows in one response.
const CLICK_LOG_LIMIT = 50;

// Ceiling for the dedicated getClicks endpoint - higher than CLICK_LOG_LIMIT
// since returning click details is the whole point of that response, but
// still bounded for the same reason as above. Also used as the default when
// no `limit` query param is supplied, so "give me the clicks for this url"
// returns everything up to this ceiling without callers having to know it exists.
const MAX_CLICK_LOG_LIMIT = 1000;

@Injectable()
export class ShortUrlService {
  constructor(
    @Inject(SHORT_URL_REPOSITORY) private readonly repository: ShortUrlRepository,
    private readonly config: ConfigService,
  ) {}

  async create(destination: string): Promise<ShortUrlResponseDto> {
    for (let attempt = 1; attempt <= MAX_CODE_GENERATION_ATTEMPTS; attempt++) {
      const code = generateBase62Code();
      try {
        const shortUrl = await this.repository.create({ code, destination });
        return this.toResponseDto(shortUrl);
      } catch (error) {
        if (error instanceof ShortCodeCollisionError) {
          continue;
        }
        throw error;
      }
    }
    throw new ShortCodeGenerationError(MAX_CODE_GENERATION_ATTEMPTS);
  }

  // One round trip for code generation (findExistingCodes) plus one round
  // trip for the write itself (createMany), regardless of batch size -
  // versus the O(n) round trips a loop of individual `create()` calls would
  // cost. See docs/architecture.md ("Bulk short URL creation").
  async createBulk(items: BulkCreateItem[]): Promise<ShortUrlBulkResponseDto> {
    const codes = await this.generateUniqueCodes(items.length);
    const entries = items.map((item, index) => ({
      code: codes[index],
      destination: item.destination,
      createdBy: item.createdBy,
    }));
    const created = await this.repository.createMany(entries);
    // createMany returns only a count for MongoDB (no read-back of the
    // inserted rows) - `results` is built from `entries`, which this method
    // already constructed in memory before the insert, not from a second DB
    // read. Positionally correlated with `items` since `entries` is never
    // reordered.
    const results = entries.map((entry) => ({
      destination: entry.destination,
      code: entry.code,
      shortUrl: `${this.config.baseUrl}/r/${entry.code}`,
      createdBy: entry.createdBy,
    }));
    return { created, results };
  }

  private async generateUniqueCodes(count: number): Promise<string[]> {
    const codes = this.fillWithFreshCodes(new Set<string>(), count);

    for (let attempt = 1; attempt <= MAX_CODE_GENERATION_ATTEMPTS; attempt++) {
      const taken = await this.repository.findExistingCodes([...codes]);
      if (taken.size === 0) {
        return [...codes];
      }
      for (const code of taken) {
        codes.delete(code);
      }
      this.fillWithFreshCodes(codes, count);
    }
    throw new ShortCodeGenerationError(MAX_CODE_GENERATION_ATTEMPTS);
  }

  // Mutates and returns `codes`, topping it up to `count` unique entries.
  // Using a Set throughout (rather than an array) guarantees every code
  // generated across every attempt is unique within the batch, not just
  // unique against the database.
  private fillWithFreshCodes(codes: Set<string>, count: number): Set<string> {
    while (codes.size < count) {
      codes.add(generateBase62Code());
    }
    return codes;
  }

  async getStats(code: string): Promise<ShortUrlStatsResponseDto> {
    const shortUrl = await this.repository.findByCode(code);
    if (!shortUrl) {
      throw new ShortUrlNotFoundError(code);
    }
    const clicks = await this.repository.findClickLogs(code, CLICK_LOG_LIMIT);
    return {
      id: shortUrl.id,
      code: shortUrl.code,
      destination: shortUrl.destination,
      shortUrl: `${this.config.baseUrl}/r/${shortUrl.code}`,
      clickCount: shortUrl.clickCount,
      createdAt: shortUrl.createdAt,
      lastAccessedAt: shortUrl.lastAccessedAt,
      expiresAt: shortUrl.expiresAt,
      status: shortUrl.status,
      clicks,
    };
  }

  async getClicks(code: string, limit: number = MAX_CLICK_LOG_LIMIT): Promise<ShortUrlClicksResponseDto> {
    const shortUrl = await this.repository.findByCode(code);
    if (!shortUrl) {
      throw new ShortUrlNotFoundError(code);
    }
    const boundedLimit = Math.min(Math.max(limit, 1), MAX_CLICK_LOG_LIMIT);
    const clicks = await this.repository.findClickLogs(code, boundedLimit);
    return {
      code: shortUrl.code,
      clickCount: shortUrl.clickCount,
      clicks,
    };
  }

  async redirect(code: string, context: RequestContext): Promise<ShortUrl> {
    const metadata = parseClickMetadata(context.userAgent);
    return this.repository.recordClick(code, {
      ...context,
      ...metadata,
      responseStatus: HttpStatus.FOUND,
    });
  }

  private toResponseDto(shortUrl: ShortUrl): ShortUrlResponseDto {
    return {
      id: shortUrl.id,
      code: shortUrl.code,
      shortUrl: `${this.config.baseUrl}/r/${shortUrl.code}`,
    };
  }
}
