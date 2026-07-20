import { ClickLogEntryDto } from './short-url-stats-response.dto';

export interface ShortUrlClicksResponseDto {
  code: string;
  clickCount: number;
  /** Most recent clicks first, capped at MAX_CLICK_LOG_LIMIT (see short-url.service.ts). */
  clicks: ClickLogEntryDto[];
}
