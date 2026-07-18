import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ShortCodeGenerationError } from '../../../src/common/errors/short-code-generation.error';
import { ShortUrlNotFoundError } from '../../../src/common/errors/short-url-not-found.error';
import { GlobalExceptionFilter } from '../../../src/common/filters/global-exception.filter';

function createHost(): { host: ArgumentsHost; status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({}),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

function createLogger(): PinoLogger {
  return {
    setContext: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  } as unknown as PinoLogger;
}

describe('GlobalExceptionFilter', () => {
  it('maps an HttpException (e.g. a Zod validation failure) to its own status/body', () => {
    const filter = new GlobalExceptionFilter(createLogger());
    const { host, status, json } = createHost();

    filter.catch(new BadRequestException({ error: 'ValidationError', message: 'bad input' }), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith({ error: 'ValidationError', message: 'bad input' });
  });

  it('maps ShortUrlNotFoundError to 404', () => {
    const filter = new GlobalExceptionFilter(createLogger());
    const { host, status, json } = createHost();

    filter.catch(new ShortUrlNotFoundError('abc123'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith({ error: 'NotFound', message: expect.stringContaining('abc123') });
  });

  it('maps ShortCodeGenerationError to 500 with its own safe message', () => {
    const filter = new GlobalExceptionFilter(createLogger());
    const { host, status, json } = createHost();

    filter.catch(new ShortCodeGenerationError(5), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({ error: 'InternalError', message: expect.stringContaining('5 attempts') });
  });

  it('maps an unhandled error to a generic 500 without leaking its message', () => {
    const logger = createLogger();
    const filter = new GlobalExceptionFilter(logger);
    const { host, status, json } = createHost();

    filter.catch(new Error('super secret internal detail'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({ error: 'InternalError', message: 'An unexpected error occurred' });
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('super secret internal detail');
    expect(logger.error).toHaveBeenCalled();
  });
});
