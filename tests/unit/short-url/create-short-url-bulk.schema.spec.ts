import { CreateShortUrlBulkSchema, MAX_BULK_ITEMS } from '../../../src/short-url/dto/create-short-url-bulk.schema';

describe('CreateShortUrlBulkSchema', () => {
  it('accepts a list of valid https destinations, with an optional createdBy per item', () => {
    const result = CreateShortUrlBulkSchema.safeParse({
      items: [
        { destination: 'https://example.com/1' },
        { destination: 'https://example.com/2', createdBy: 'patient:42' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty items array', () => {
    const result = CreateShortUrlBulkSchema.safeParse({ items: [] });
    expect(result.success).toBe(false);
  });

  it('rejects more than MAX_BULK_ITEMS entries', () => {
    const items = Array.from({ length: MAX_BULK_ITEMS + 1 }, (_, i) => ({
      destination: `https://example.com/${i}`,
    }));
    const result = CreateShortUrlBulkSchema.safeParse({ items });
    expect(result.success).toBe(false);
  });

  it('accepts exactly MAX_BULK_ITEMS entries', () => {
    const items = Array.from({ length: MAX_BULK_ITEMS }, (_, i) => ({
      destination: `https://example.com/${i}`,
    }));
    const result = CreateShortUrlBulkSchema.safeParse({ items });
    expect(result.success).toBe(true);
  });

  it('rejects a non-URL destination within the array', () => {
    const result = CreateShortUrlBulkSchema.safeParse({ items: [{ destination: 'not-a-url' }] });
    expect(result.success).toBe(false);
  });

  it('rejects a missing items field', () => {
    const result = CreateShortUrlBulkSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
