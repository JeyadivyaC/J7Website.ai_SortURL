import { parseClickMetadata } from '../../../src/short-url/click-metadata';

const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const MOBILE_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

describe('parseClickMetadata', () => {
  it('parses a desktop Chrome/Windows user agent and defaults deviceType to "desktop"', () => {
    expect(parseClickMetadata(DESKTOP_CHROME_UA)).toEqual({
      deviceType: 'desktop',
      browser: 'Chrome',
      operatingSystem: 'Windows',
      isBot: false,
    });
  });

  it('parses a mobile Safari/iOS user agent', () => {
    expect(parseClickMetadata(MOBILE_SAFARI_UA)).toEqual({
      deviceType: 'mobile',
      browser: 'Mobile Safari',
      operatingSystem: 'iOS',
      isBot: false,
    });
  });

  it('flags a known bot user agent as isBot', () => {
    expect(parseClickMetadata(GOOGLEBOT_UA).isBot).toBe(true);
  });

  it('falls back to nulls for an empty/unparseable user agent', () => {
    const result = parseClickMetadata('');
    expect(result.browser).toBeNull();
    expect(result.operatingSystem).toBeNull();
    expect(result.deviceType).toBe('desktop');
  });
});
