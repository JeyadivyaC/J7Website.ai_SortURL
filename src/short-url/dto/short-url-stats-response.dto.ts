import { ShortUrlStatus } from '../short-url.repository';

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
}
