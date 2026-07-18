import { ArgumentMetadata, BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

// NestJS ships no first-party Zod integration - this pipe is constructed
// per-route with a specific schema (e.g. `new ZodValidationPipe(CreateShortUrlSchema)`),
// giving validation and static typing (via z.infer) in a single step, as
// mandated by the spec in place of class-validator.
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        error: 'ValidationError',
        message: 'Request validation failed',
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}
