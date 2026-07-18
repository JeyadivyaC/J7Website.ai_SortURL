import { ShortUrlStatus } from '../short-url.repository';

export interface ClickLogEntryDto {
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

export interface ShortUrlStatsResponseDto {
  id: string;
  code: string;
  destination: string;
  shortUrl: string;
  clickCount: number;
  createdAt: Date;
  lastAccessedAt: Date | null;
  expiresAt: Date | null;
  status: ShortUrlStatus;
  /** Most recent clicks first, capped at CLICK_LOG_LIMIT (see short-url.service.ts). */
  clicks: ClickLogEntryDto[];
}
