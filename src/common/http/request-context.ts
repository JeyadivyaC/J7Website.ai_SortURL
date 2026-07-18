import { Request } from 'express';

export interface RequestContext {
  ipAddress: string;
  userAgent: string;
  referer: string;
  httpMethod: string;
  requestPath: string;
  queryString: string;
  requestId: string;
  country: string | null;
  region: string | null;
  city: string | null;
}

// serverless-express (see src/lambda.ts) feeds API Gateway's requestContext
// sourceIp into the synthetic connection it hands to Express, so req.ip
// already reflects the real client IP in both Lambda and local dev - no
// apiGateway-specific access needed here.
//
// requestId reuses req.id, which nestjs-pino/pino-http (AppLoggerModule)
// already computed as the API Gateway request ID (a UUID) or, locally where
// there's no API Gateway event, a fresh crypto.randomUUID() - the same value
// that ties this request's log lines together, so the click log correlates
// with them for free instead of minting a second, unrelated id.
//
// country/region/city come from CloudFront's viewer-geolocation headers
// (ShortUrlDistribution's OriginRequestPolicy in template.yaml forwards
// them). Only present when traffic actually flows through CloudFront - null
// locally, or if the API Gateway URL is hit directly bypassing it.
export function extractRequestContext(req: Request): RequestContext {
  const queryIndex = req.originalUrl.indexOf('?');

  return {
    ipAddress: req.ip ?? '',
    userAgent: req.headers['user-agent'] ?? '',
    referer: req.headers.referer ?? '',
    httpMethod: req.method,
    requestPath: req.path,
    queryString: queryIndex === -1 ? '' : req.originalUrl.slice(queryIndex + 1),
    requestId: String(req.id),
    country: req.headers['cloudfront-viewer-country'] as string | undefined ?? null,
    region: req.headers['cloudfront-viewer-country-region-name'] as string | undefined ?? null,
    city: req.headers['cloudfront-viewer-city'] as string | undefined ?? null,
  };
}
