import { AppError } from './app-error';

// Internal signal used between PrismaShortUrlRepository and ShortUrlService
// to trigger a retry with a freshly generated code. Never escapes to the
// exception filter under normal operation.
export class ShortCodeCollisionError extends AppError {
  constructor(code: string) {
    super(`Short code "${code}" already exists`);
  }
}
