/**
 * Unit tests for URL validation and normalisation.
 *
 * This is the app's main input-validation boundary — the `javascript:` and
 * SSRF cases below are security tests, not merely correctness ones.
 */

import {
  buildShortUrl,
  ensureProtocol,
  extractDomain,
  isPrivateHostname,
  normalizeUrl,
  truncateUrl,
  validateUrl,
} from './url.util';

describe('ensureProtocol', () => {
  it('prefixes https when no scheme is given', () => {
    expect(ensureProtocol('example.com')).toBe('https://example.com');
  });

  it('leaves an existing scheme untouched', () => {
    expect(ensureProtocol('http://example.com')).toBe('http://example.com');
    expect(ensureProtocol('ftp://example.com')).toBe('ftp://example.com');
  });

  it('upgrades scheme-relative URLs', () => {
    expect(ensureProtocol('//example.com')).toBe('https://example.com');
  });
});

describe('validateUrl', () => {
  it('accepts a fully-qualified URL', () => {
    expect(validateUrl('https://some.place.example.com/foo/bar/biz')).toEqual({
      valid: true,
      normalized: 'https://some.place.example.com/foo/bar/biz',
    });
  });

  it('accepts input without a scheme and normalises it', () => {
    expect(validateUrl('example.com/foo').normalized).toBe('https://example.com/foo');
  });

  it('preserves query strings and fragments', () => {
    const result = validateUrl('https://example.com/search?q=nest&page=2#results');
    expect(result.normalized).toBe('https://example.com/search?q=nest&page=2#results');
  });

  it('rejects an empty value', () => {
    expect(validateUrl('')).toMatchObject({ valid: false });
    expect(validateUrl('   ').reason).toMatch(/required/);
  });

  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd'])(
    'rejects the dangerous scheme in %s',
    (url) => {
      expect(validateUrl(url)).toMatchObject({
        valid: false,
        reason: 'Only http and https URLs are supported',
      });
    },
  );

  it('rejects a bare hostname with no dot', () => {
    expect(validateUrl('https://foo').valid).toBe(false);
  });

  it('rejects URLs longer than the maximum', () => {
    expect(validateUrl(`https://example.com/${'a'.repeat(2100)}`).reason).toMatch(/at most/);
  });

  it('blocks private and loopback hosts by default', () => {
    for (const url of [
      'http://localhost:3000',
      'http://127.0.0.1',
      'http://192.168.1.1',
      'http://10.0.0.5',
      'http://172.16.0.1',
      'http://169.254.169.254', // cloud metadata endpoint
    ]) {
      expect(validateUrl(url).valid).toBe(false);
    }
  });

  it('allows private hosts when explicitly permitted (development)', () => {
    expect(validateUrl('http://localhost:3000/foo', true).valid).toBe(true);
  });
});

describe('normalizeUrl', () => {
  it('lower-cases the hostname and drops the default port', () => {
    expect(normalizeUrl('HTTPS://Example.COM:443/Foo')).toBe('https://example.com/Foo');
  });

  it('preserves path casing, which can be significant', () => {
    expect(normalizeUrl('https://example.com/CaseSensitive')).toBe(
      'https://example.com/CaseSensitive',
    );
  });

  it('strips a trailing slash from a root URL', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com');
  });
});

describe('extractDomain', () => {
  it('returns the hostname without a www prefix', () => {
    expect(extractDomain('https://www.example.com/a/b')).toBe('example.com');
    expect(extractDomain('https://sub.example.co.uk')).toBe('sub.example.co.uk');
  });

  it('returns null for unparseable input', () => {
    expect(extractDomain('not a url at all %%%')).toBeNull();
  });
});

describe('isPrivateHostname', () => {
  it('identifies private ranges', () => {
    expect(isPrivateHostname('localhost')).toBe(true);
    expect(isPrivateHostname('example.com')).toBe(false);
  });
});

describe('buildShortUrl', () => {
  it('joins the base and slug with exactly one slash', () => {
    expect(buildShortUrl('https://short.ly', 'abc123')).toBe('https://short.ly/abc123');
    expect(buildShortUrl('https://short.ly/', 'abc123')).toBe('https://short.ly/abc123');
  });
});

describe('truncateUrl', () => {
  it('leaves short URLs alone', () => {
    expect(truncateUrl('https://a.com', 60)).toBe('https://a.com');
  });

  it('elides the middle of long URLs', () => {
    const result = truncateUrl('https://example.com/a/very/long/path/indeed/really', 30);
    expect(result).toContain('…');
    expect(result.length).toBeLessThanOrEqual(30);
  });
});
