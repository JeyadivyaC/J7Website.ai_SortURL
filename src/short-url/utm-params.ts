export interface UtmParams {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

// Parses utm_source/utm_medium/utm_campaign off a URL's own query string -
// used on the resolved destination at click time (see recordClick in
// prisma-short-url.repository.ts) so campaign attribution is queryable as
// structured columns instead of re-parsing redirectUrl on every report.
export function parseUtmParams(url: string): UtmParams {
  let searchParams: URLSearchParams;
  try {
    searchParams = new URL(url).searchParams;
  } catch {
    return { utmSource: null, utmMedium: null, utmCampaign: null };
  }

  return {
    utmSource: searchParams.get('utm_source'),
    utmMedium: searchParams.get('utm_medium'),
    utmCampaign: searchParams.get('utm_campaign'),
  };
}
