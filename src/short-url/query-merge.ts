// Merges a redirect request's own query string onto a short URL's stored
// destination - lets one short code (created once against a bare landing
// page URL) serve many campaign/channel variants, e.g.
// /r/trGWp?utm_source=facebook and /r/trGWp?utm_source=instagram both
// resolving off the same stored destination but redirecting to
// https://.../msme/?utm_source=facebook and ?utm_source=instagram
// respectively, instead of needing a separate short URL per utm combination.
//
// Params already present on the stored destination are overwritten by the
// incoming request's values on conflict - the per-click value is the one
// that reflects where this particular click actually came from.
export function mergeDestinationQuery(destination: string, incomingQueryString: string): string {
  if (!incomingQueryString) {
    return destination;
  }

  let url: URL;
  try {
    url = new URL(destination);
  } catch {
    return destination;
  }

  for (const [key, value] of new URLSearchParams(incomingQueryString)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}
