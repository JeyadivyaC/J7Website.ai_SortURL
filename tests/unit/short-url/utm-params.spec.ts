import { parseUtmParams } from '../../../src/short-url/utm-params';

describe('parseUtmParams', () => {
  it('extracts utm_source/utm_medium/utm_campaign from the URL query string', () => {
    const result = parseUtmParams(
      'https://www.ippobill.com/freedom/?utm_source=instagram&utm_medium=paid&utm_campaign=independence26',
    );

    expect(result).toEqual({
      utmSource: 'instagram',
      utmMedium: 'paid',
      utmCampaign: 'independence26',
    });
  });

  it('returns null for any utm param missing from the query string', () => {
    const result = parseUtmParams('https://example.com/path?utm_source=sms');

    expect(result).toEqual({ utmSource: 'sms', utmMedium: null, utmCampaign: null });
  });

  it('returns all null when the URL has no query string at all', () => {
    const result = parseUtmParams('https://example.com/path');

    expect(result).toEqual({ utmSource: null, utmMedium: null, utmCampaign: null });
  });

  it('returns all null instead of throwing when the value is not a valid URL', () => {
    const result = parseUtmParams('not-a-url');

    expect(result).toEqual({ utmSource: null, utmMedium: null, utmCampaign: null });
  });
});
