import { UAParser } from 'ua-parser-js';
import { isbot } from 'isbot';

export interface ClickMetadata {
  deviceType: string;
  browser: string | null;
  operatingSystem: string | null;
  isBot: boolean;
}

// ua-parser-js's device.type is only set for non-desktop classes (mobile,
// tablet, smarttv, wearable, console, embedded, xr); absent means desktop.
const DEFAULT_DEVICE_TYPE = 'desktop';

export function parseClickMetadata(userAgent: string): ClickMetadata {
  const { browser, os, device } = new UAParser(userAgent).getResult();

  return {
    deviceType: device.type ?? DEFAULT_DEVICE_TYPE,
    browser: browser.name ?? null,
    operatingSystem: os.name ?? null,
    isBot: isbot(userAgent),
  };
}
