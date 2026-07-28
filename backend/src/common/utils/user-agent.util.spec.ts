/**
 * Unit tests for User-Agent parsing.
 *
 * The ordering-sensitive cases (Edge claiming to be Chrome, iOS claiming to be
 * macOS) are the ones most likely to regress if the matcher list is reordered.
 */

import { detectBrowser, detectDeviceType, detectOs, parseUserAgent } from './user-agent.util';

/** Representative agents covering the combinations the dashboard reports. */
const AGENTS = {
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36 Edg/119.0',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
  safariIpad:
    'Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/604.1',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  curl: 'curl/8.4.0',
} as const;

describe('detectBrowser', () => {
  it('identifies common browsers', () => {
    expect(detectBrowser(AGENTS.chromeMac)).toBe('Chrome');
    expect(detectBrowser(AGENTS.firefoxLinux)).toBe('Firefox');
    expect(detectBrowser(AGENTS.safariIphone)).toBe('Safari');
  });

  it('prefers Edge over the Chrome token it also carries', () => {
    expect(detectBrowser(AGENTS.edgeWindows)).toBe('Edge');
  });

  it('labels bots as Bot rather than by their claimed engine', () => {
    expect(detectBrowser(AGENTS.googlebot)).toBe('Bot');
  });

  it('degrades to Unknown for empty input', () => {
    expect(detectBrowser('')).toBe('Unknown');
  });
});

describe('detectOs', () => {
  it('identifies operating systems', () => {
    expect(detectOs(AGENTS.chromeMac)).toBe('macOS');
    expect(detectOs(AGENTS.edgeWindows)).toBe('Windows');
    expect(detectOs(AGENTS.chromeAndroid)).toBe('Android');
    expect(detectOs(AGENTS.firefoxLinux)).toBe('Linux');
  });

  it('prefers iOS over the "Mac OS X" token iPhones also send', () => {
    expect(detectOs(AGENTS.safariIphone)).toBe('iOS');
  });
});

describe('detectDeviceType', () => {
  it('classifies desktops', () => {
    expect(detectDeviceType(AGENTS.chromeMac)).toBe('desktop');
  });

  it('classifies phones', () => {
    expect(detectDeviceType(AGENTS.safariIphone)).toBe('mobile');
    expect(detectDeviceType(AGENTS.chromeAndroid)).toBe('mobile');
  });

  it('classifies tablets separately from phones', () => {
    expect(detectDeviceType(AGENTS.safariIpad)).toBe('tablet');
  });

  it('classifies automated clients as bots', () => {
    expect(detectDeviceType(AGENTS.googlebot)).toBe('bot');
    expect(detectDeviceType(AGENTS.curl)).toBe('bot');
  });

  it('returns unknown for an absent header', () => {
    expect(detectDeviceType('')).toBe('unknown');
  });
});

describe('parseUserAgent', () => {
  it('returns every derived field at once', () => {
    expect(parseUserAgent(AGENTS.chromeMac)).toEqual({
      browser: 'Chrome',
      os: 'macOS',
      deviceType: 'desktop',
    });
  });

  it('never throws on null or undefined', () => {
    expect(parseUserAgent(null)).toEqual({
      browser: 'Unknown',
      os: 'Unknown',
      deviceType: 'unknown',
    });
    expect(parseUserAgent(undefined).browser).toBe('Unknown');
  });
});
