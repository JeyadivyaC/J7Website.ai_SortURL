import { Request } from 'express';
import { extractRequestContext } from '../../../../src/common/http/request-context';

function createRequest(overrides: Record<string, unknown> = {}): Request {
  return {
    ip: '203.0.113.5',
    headers: {
      'user-agent': 'test-agent',
      referer: 'https://example.com',
    },
    method: 'GET',
    path: '/r/abc123',
    originalUrl: '/r/abc123',
    id: 'req-1',
    ...overrides,
  } as unknown as Request;
}

describe('extractRequestContext', () => {
  it('extracts ip/userAgent/referer/method/path/requestId from a fully populated request', () => {
    const req = createRequest();

    expect(extractRequestContext(req)).toEqual({
      ipAddress: '203.0.113.5',
      userAgent: 'test-agent',
      referer: 'https://example.com',
      httpMethod: 'GET',
      requestPath: '/r/abc123',
      queryString: '',
      requestId: 'req-1',
      country: null,
      region: null,
      city: null,
    });
  });

  it('extracts CloudFront viewer-geolocation headers when present', () => {
    const req = createRequest({
      headers: {
        'user-agent': 'test-agent',
        referer: '',
        'cloudfront-viewer-country': 'IN',
        'cloudfront-viewer-country-region-name': 'Tamil Nadu',
        'cloudfront-viewer-city': 'Chennai',
      },
    });

    const context = extractRequestContext(req);
    expect(context.country).toBe('IN');
    expect(context.region).toBe('Tamil Nadu');
    expect(context.city).toBe('Chennai');
  });

  it('defaults country/region/city to null when traffic bypasses CloudFront', () => {
    const req = createRequest({ headers: {} });

    const context = extractRequestContext(req);
    expect(context.country).toBeNull();
    expect(context.region).toBeNull();
    expect(context.city).toBeNull();
  });

  it('splits the query string out of originalUrl', () => {
    const req = createRequest({ originalUrl: '/r/abc123?utm_source=sms&utm_campaign=x' });

    expect(extractRequestContext(req).queryString).toBe('utm_source=sms&utm_campaign=x');
  });

  it('defaults userAgent/referer to empty string when the headers are absent', () => {
    const req = createRequest({ headers: {} });

    const context = extractRequestContext(req);
    expect(context.userAgent).toBe('');
    expect(context.referer).toBe('');
  });

  it('stringifies a non-string req.id (pino-http types ReqId as string | number | object)', () => {
    const req = createRequest({ id: 42 as unknown as string });

    expect(extractRequestContext(req).requestId).toBe('42');
  });

  it('defaults ipAddress to empty string when req.ip is unavailable', () => {
    const req = createRequest({ ip: undefined });

    expect(extractRequestContext(req).ipAddress).toBe('');
  });
});
