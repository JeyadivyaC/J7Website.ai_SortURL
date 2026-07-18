import { CreateShortUrlSchema } from '../../../src/short-url/dto/create-short-url.schema';

describe('CreateShortUrlSchema', () => {
  it('accepts a valid https destination', () => {
    const result = CreateShortUrlSchema.safeParse({ destination: 'https://google.com/review?id=123' });
    expect(result.success).toBe(true);
  });

  it('rejects a missing destination', () => {
    const result = CreateShortUrlSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects a non-URL destination', () => {
    const result = CreateShortUrlSchema.safeParse({ destination: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('rejects a destination of the wrong type', () => {
    const result = CreateShortUrlSchema.safeParse({ destination: 12345 });
    expect(result.success).toBe(false);
  });
});
