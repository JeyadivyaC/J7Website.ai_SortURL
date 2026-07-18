import { AppError } from './app-error';

export class ShortCodeGenerationError extends AppError {
  constructor(attempts: number) {
    super(`Unable to generate a unique short code after ${attempts} attempts, please retry`);
  }
}
