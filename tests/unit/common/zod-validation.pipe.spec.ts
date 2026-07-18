import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../src/common/pipes/zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const schema = z.object({ name: z.string().min(1) });
  const pipe = new ZodValidationPipe(schema);
  const metadata: ArgumentMetadata = { type: 'body' };

  it('returns the parsed value when the input is valid', () => {
    expect(pipe.transform({ name: 'J7Website' }, metadata)).toEqual({ name: 'J7Website' });
  });

  it('throws a BadRequestException with formatted issues when invalid', () => {
    expect.assertions(3);
    try {
      pipe.transform({ name: '' }, metadata);
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as Record<string, unknown>;
      expect(response.error).toBe('ValidationError');
      expect(Array.isArray(response.issues)).toBe(true);
    }
  });
});
