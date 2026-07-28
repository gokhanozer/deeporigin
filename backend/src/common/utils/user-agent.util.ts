/**
 * Minimal User-Agent parsing for visit analytics.
 *
 * A deliberate ~80-line implementation instead of a dependency such as
 * `ua-parser-js`: the dashboard only needs a coarse browser / OS / device-type
 * breakdown, User-Agent strings are being frozen and deprecated across the
 * industry anyway, and this keeps the container image small with zero supply-
 * chain surface. The parser is intentionally forgiving — an unrecognised agent
 * degrades to `'Unknown'` rather than throwing.
 */

/** Coarse device classification used by the dashboard. */
export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown';

/** Everything derived from a single User-Agent string. */
export interface ParsedUserAgent {
  /** Browser family, e.g. `Chrome`, `Safari`, `Firefox`. */
  browser: string;
  /** Operating system family, e.g. `macOS`, `Windows`, `Android`. */
  os: string;
  /** Coarse device class. */
  deviceType: DeviceType;
}

/** Ordered browser matchers. Order matters: Edge and Opera both claim "Chrome". */
const BROWSER_MATCHERS: ReadonlyArray<[RegExp, string]> = [
  [/edg(e|a|ios)?\//i, 'Edge'],
  [/opr\/|opera/i, 'Opera'],
  [/samsungbrowser/i, 'Samsung Internet'],
  [/firefox|fxios/i, 'Firefox'],
  [/chrome|crios/i, 'Chrome'],
  [/safari/i, 'Safari'],
  [/msie|trident/i, 'Internet Explorer'],
];

/** Ordered OS matchers. iOS must precede macOS: iPhones mention both. */
const OS_MATCHERS: ReadonlyArray<[RegExp, string]> = [
  [/windows nt/i, 'Windows'],
  [/iphone|ipad|ipod|ios/i, 'iOS'],
  [/mac os x|macintosh/i, 'macOS'],
  [/android/i, 'Android'],
  [/cros/i, 'ChromeOS'],
  [/linux/i, 'Linux'],
];

/** Substrings that identify automated clients. */
const BOT_PATTERN = /bot|crawler|spider|crawling|slurp|curl|wget|python-requests|axios|headless|preview|facebookexternalhit|whatsapp|telegram|slackbot|discordbot|bingpreview/i;

/** Substrings that identify tablets. Checked before the generic mobile test. */
const TABLET_PATTERN = /ipad|tablet|playbook|silk|(android(?!.*mobile))/i;

/** Substrings that identify phones. */
const MOBILE_PATTERN = /mobile|iphone|ipod|android|blackberry|opera mini|iemobile|webos/i;

/**
 * Classifies a User-Agent into a device type.
 *
 * Bots are detected first: a crawler preview should never be counted as a real
 * mobile visitor, and separating them keeps the dashboard's numbers honest.
 *
 * @param userAgent Raw `User-Agent` header.
 * @returns The device classification.
 *
 * @example
 * detectDeviceType('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0…)'); // 'mobile'
 * detectDeviceType('Googlebot/2.1');                             // 'bot'
 */
export function detectDeviceType(userAgent: string): DeviceType {
  if (!userAgent) return 'unknown';
  if (BOT_PATTERN.test(userAgent)) return 'bot';
  if (TABLET_PATTERN.test(userAgent)) return 'tablet';
  if (MOBILE_PATTERN.test(userAgent)) return 'mobile';
  return 'desktop';
}

/**
 * Extracts the browser family from a User-Agent.
 *
 * @param userAgent Raw `User-Agent` header.
 * @returns A browser name, or `'Unknown'`.
 */
export function detectBrowser(userAgent: string): string {
  if (!userAgent) return 'Unknown';
  if (BOT_PATTERN.test(userAgent)) return 'Bot';
  const match = BROWSER_MATCHERS.find(([pattern]) => pattern.test(userAgent));
  return match ? match[1] : 'Unknown';
}

/**
 * Extracts the operating-system family from a User-Agent.
 *
 * @param userAgent Raw `User-Agent` header.
 * @returns An OS name, or `'Unknown'`.
 */
export function detectOs(userAgent: string): string {
  if (!userAgent) return 'Unknown';
  const match = OS_MATCHERS.find(([pattern]) => pattern.test(userAgent));
  return match ? match[1] : 'Unknown';
}

/**
 * Parses a User-Agent into every field the `Visit` record stores.
 *
 * Called once per redirect, so the cost of parsing is paid on write and never
 * on the analytics read path.
 *
 * @param userAgent Raw `User-Agent` header (may be `undefined`).
 * @returns Browser, OS and device type.
 *
 * @example
 * parseUserAgent('Mozilla/5.0 (Macintosh…) Chrome/120 Safari/537.36');
 * // { browser: 'Chrome', os: 'macOS', deviceType: 'desktop' }
 */
export function parseUserAgent(userAgent: string | undefined | null): ParsedUserAgent {
  const value = userAgent ?? '';
  return {
    browser: detectBrowser(value),
    os: detectOs(value),
    deviceType: detectDeviceType(value),
  };
}
