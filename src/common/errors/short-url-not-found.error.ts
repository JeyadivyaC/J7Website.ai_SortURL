import { AppError } from './app-error';

export class ShortUrlNotFoundError extends AppError {
  constructor(code: string) {
    super(`Short URL with code "${code}" was not found`);
  }
}
