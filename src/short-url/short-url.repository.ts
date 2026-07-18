export type ShortUrlStatus = 'ACTIVE' | 'EXPIRED' | 'DISABLED';

export interface ShortUrl {
  id: string;
  code: string;
  destination: string;
  clickCount: number;
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt: Date | null;
  expiresAt: Date | null;
  createdBy: string | null;
  status: ShortUrlStatus;
}

export interface CreateShortUrlData {
  code: string;
  destination: string;
  createdBy?: string;
  expiresAt?: Date;
}

export interface BulkCreateShortUrlData {
  code: string;
  destination: string;
  createdBy?: string;
}

// Everything recordClick needs to write a short_url_click_logs row beyond
// what the repository derives itself (shortUrlId/code from the lookup,
// redirectUrl from the resolved destination). Geo-IP (country/region/city)
// is stubbed for now - see docs/architecture.md.
export interface ClickLogInput {
  ipAddress: string;
  userAgent: string;
  referer: string;
  httpMethod: string;
  requestPath: string;
  queryString: string;
  country: string | null;
  region: string | null;
  city: string | null;
  deviceType: string;
  browser: string | null;
  operatingSystem: string | null;
  isBot: boolean;
  responseStatus: number;
  requestId: string;
}

// One row per past click, as written by recordClick - see ClickLogInput for
// what's captured at write time. redirectUrl is the resolved destination at
// the time of that click (not necessarily today's destination).
export interface ClickLogRecord {
  clickedAt: Date;
  ipAddress: string;
  userAgent: string;
  referer: string;
  country: string | null;
  region: string | null;
  city: string | null;
  deviceType: string | null;
  browser: string | null;
  operatingSystem: string | null;
  isBot: boolean;
  responseStatus: number;
  redirectUrl: string;
}

// DI token for the repository interface, so ShortUrlService depends only on
// this abstraction (never on Prisma directly) and can be unit tested with a
// plain mock. See prisma-short-url.repository.ts for the concrete adapter.
export const SHORT_URL_REPOSITORY = 'SHORT_URL_REPOSITORY';

export interface ShortUrlRepository {
  /** Throws ShortCodeCollisionError if `data.code` already exists. */
  create(data: CreateShortUrlData): Promise<ShortUrl>;
  findByCode(code: string): Promise<ShortUrl | null>;
  /**
   * Atomically increments click_count/last_accessed_at on the matching
   * short_urls row and inserts one immutable short_url_click_logs row, in a
   * single transaction. Throws ShortUrlNotFoundError if `code` doesn't
   * exist - in that case nothing is written, including no click log.
   */
  recordClick(code: string, clickLog: ClickLogInput): Promise<ShortUrl>;
  /** Returns the subset of `codes` that already exist, in one round trip. */
  findExistingCodes(codes: string[]): Promise<Set<string>>;
  /**
   * Inserts every entry in one batched write. Callers must have already
   * confirmed (via findExistingCodes) that none of `entries[].code` exist -
   * this method does not itself retry or translate collisions, since a
   * partial failure partway through a batch has no clean per-entry recovery.
   */
  createMany(entries: BulkCreateShortUrlData[]): Promise<number>;
  /** Most recent clicks for `code` first, capped at `limit`. */
  findClickLogs(code: string, limit: number): Promise<ClickLogRecord[]>;
}
