import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { ShortCodeGenerationError } from '../errors/short-code-generation.error';
import { ShortUrlNotFoundError } from '../errors/short-url-not-found.error';

interface MappedException {
  status: number;
  body: Record<string, unknown>;
}

// Single global filter mapping every thrown error to an HTTP response.
// Unhandled/unexpected errors always get a generic body - the real message
// and stack trace only ever go to the logger, never to the client.
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(GlobalExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.mapException(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({ err: exception }, 'Unhandled error while processing request');
    } else {
      this.logger.warn({ err: exception }, 'Request failed');
    }

    response.status(status).json(body);
  }

  private mapException(exception: unknown): MappedException {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const httpResponse = exception.getResponse();
      const body =
        typeof httpResponse === 'string'
          ? { error: exception.name, message: httpResponse }
          : (httpResponse as Record<string, unknown>);
      return { status, body };
    }

    if (exception instanceof ShortUrlNotFoundError) {
      return {
        status: HttpStatus.NOT_FOUND,
        body: { error: 'NotFound', message: exception.message },
      };
    }

    if (exception instanceof ShortCodeGenerationError) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        body: { error: 'InternalError', message: exception.message },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { error: 'InternalError', message: 'An unexpected error occurred' },
    };
  }
}
