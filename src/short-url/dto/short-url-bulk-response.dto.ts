export interface ShortUrlBulkResponseDto {
  created: number;
  results: Array<{ destination: string; code: string; shortUrl: string; createdBy?: string }>;
}
