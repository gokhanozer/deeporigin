/**
 * URL validation, normalisation and short-link construction.
 *
 * The task requires that we "validate the URL provided is an actual URL". That
 * is done here with the WHATWG `URL` parser rather than a regular expression:
 * a regex either rejects valid URLs (IDNs, IPv6 literals, unusual ports) or
 * accepts invalid ones, whereas the platform parser implements the actual spec.
 */

import { ALLOWED_URL_PROTOCOLS, MAX_URL_LENGTH } from '../constants/app.constants';

/** Structured outcome of a URL validation check. */
export interface UrlValidationResult {
  /** `true` when the URL is safe to store and redirect to. */
  valid: boolean;
  /** Human-readable explanation, present only when `valid` is `false`. */
  reason?: string;
  /** Canonical form of the input, present only when `valid` is `true`. */
  normalized?: string;
}

/**
 * Hostnames that resolve to the server itself or to a private network.
 * Redirecting to these turns the shortener into an SSRF pivot, so they are
 * blocked outside development.
 */
const PRIVATE_HOST_PATTERNS: readonly RegExp[] = [
  /^localhost$/i,
  /^127\./, // IPv4 loopback
  /^0\.0\.0\.0$/,
  /^10\./, // RFC1918 class A
  /^192\.168\./, // RFC1918 class C
  /^172\.(1[6-9]|2\d|3[01])\./, // RFC1918 class B
  /^169\.254\./, // link-local / cloud metadata
  /^\[?::1\]?$/, // IPv6 loopback
  /\.local$/i,
  /\.internal$/i,
];

/**
 * Adds a default `https://` scheme when the user omitted one.
 *
 * People type `example.com`, not `https://example.com`. Rejecting that would be
 * needlessly hostile, so we upgrade it before parsing. Anything that already
 * carries a scheme is passed through untouched, so a bad scheme still fails
 * validation rather than being silently rewritten.
 *
 * @param input Raw user input.
 * @returns The input with a scheme guaranteed to be present.
 *
 * @example
 * ensureProtocol('example.com');         // 'https://example.com'
 * ensureProtocol('http://example.com');  // 'http://example.com'
 */
export function ensureProtocol(input: string): string {
  const trimmed = input.trim();
  // Matches any RFC-3986 scheme followed by "//" — or the scheme-relative "//".
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return `https://${trimmed}`;
}

/**
 * Reports whether a hostname points at a loopback or private-network address.
 *
 * @param hostname Hostname taken from a parsed URL.
 * @returns `true` when the host is private.
 */
export function isPrivateHostname(hostname: string): boolean {
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

/**
 * Validates and canonicalises a destination URL.
 *
 * Checks applied, in order:
 *  1. non-empty and within {@link MAX_URL_LENGTH};
 *  2. parses as a URL once a scheme has been ensured;
 *  3. scheme is `http:` or `https:` — this is what blocks `javascript:` and
 *     `data:` payloads, which would otherwise be a stored-XSS vector;
 *  4. a hostname with a dot (or an explicit IP) is present, rejecting `https://foo`;
 *  5. optionally, the host is not private (SSRF / internal-network protection).
 *
 * @param input          Raw URL from user input.
 * @param allowPrivate   Permit localhost and RFC1918 hosts. Enabled in
 *                       development so the app can shorten local URLs.
 * @returns A {@link UrlValidationResult} carrying either the canonical URL or a reason.
 *
 * @example
 * validateUrl('example.com/foo');
 * // { valid: true, normalized: 'https://example.com/foo' }
 *
 * validateUrl('javascript:alert(1)');
 * // { valid: false, reason: 'Only http and https URLs are supported' }
 */
export function validateUrl(input: string, allowPrivate = false): UrlValidationResult {
  const raw = (input ?? '').trim();

  if (raw.length === 0) {
    return { valid: false, reason: 'URL is required' };
  }
  if (raw.length > MAX_URL_LENGTH) {
    return { valid: false, reason: `URL must be at most ${MAX_URL_LENGTH} characters` };
  }

  let parsed: URL;
  try {
    parsed = new URL(ensureProtocol(raw));
  } catch {
    return { valid: false, reason: 'Please enter a valid URL' };
  }

  if (!ALLOWED_URL_PROTOCOLS.includes(parsed.protocol)) {
    return { valid: false, reason: 'Only http and https URLs are supported' };
  }
  if (parsed.hostname.length === 0) {
    return { valid: false, reason: 'URL must include a hostname' };
  }

  // A bare label such as `https://foo` is almost always a typo. Allow it only
  // when it is an IP literal or when private hosts are explicitly permitted.
  const isIpLiteral = /^\d{1,3}(\.\d{1,3}){3}$/.test(parsed.hostname) || parsed.hostname.includes(':');
  if (!parsed.hostname.includes('.') && !isIpLiteral && !allowPrivate) {
    return { valid: false, reason: 'Please enter a valid URL, for example https://example.com' };
  }
  if (!allowPrivate && isPrivateHostname(parsed.hostname)) {
    return { valid: false, reason: 'URLs pointing to local or private addresses are not allowed' };
  }

  return { valid: true, normalized: normalizeUrl(parsed) };
}

/**
 * Produces the canonical string form of a URL.
 *
 * Normalisation rules: lower-case the hostname, drop the default port, and
 * remove a trailing slash from an otherwise-empty path. Query strings and
 * fragments are preserved verbatim — they frequently carry meaning (campaign
 * tags, SPA routes) and stripping them would break the destination.
 *
 * @param url A parsed `URL` or a URL string.
 * @returns The canonical URL string.
 *
 * @example
 * normalizeUrl('HTTPS://Example.COM:443/foo/');  // 'https://example.com/foo/'
 * normalizeUrl('https://example.com/');          // 'https://example.com'
 */
export function normalizeUrl(url: URL | string): string {
  const parsed = typeof url === 'string' ? new URL(ensureProtocol(url)) : url;
  parsed.hostname = parsed.hostname.toLowerCase();

  const serialized = parsed.toString();
  // `new URL('https://example.com').toString()` yields a trailing slash; strip
  // it so the stored value matches what the user typed.
  if (parsed.pathname === '/' && !parsed.search && !parsed.hash) {
    return serialized.replace(/\/$/, '');
  }
  return serialized;
}

/**
 * Extracts the registrable-ish hostname from a URL, without the `www.` prefix.
 *
 * Used in the UI to show `example.com` next to a long destination, and in
 * analytics to group referrers.
 *
 * @param url Any URL string.
 * @returns The bare hostname, or `null` when the input cannot be parsed.
 *
 * @example
 * extractDomain('https://www.example.com/a/b'); // 'example.com'
 */
export function extractDomain(url: string): string | null {
  try {
    return new URL(ensureProtocol(url)).hostname.replace(/^www\./i, '');
  } catch {
    return null;
  }
}

/**
 * Builds the public short URL for a slug.
 *
 * The single place where a short link is assembled, so changing the public
 * domain is a one-line configuration change rather than a search-and-replace.
 *
 * @param baseUrl Public base URL, with or without a trailing slash.
 * @param slug    The link's slug.
 * @returns The absolute short URL.
 *
 * @example
 * buildShortUrl('https://short.ly/', 'abc123'); // 'https://short.ly/abc123'
 */
export function buildShortUrl(baseUrl: string, slug: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${slug}`;
}

/**
 * Shortens a URL for display, keeping the start and end legible.
 *
 * @param url       URL to truncate.
 * @param maxLength Maximum length of the returned string. Defaults to 60.
 * @returns The URL, elided in the middle with `…` when too long.
 *
 * @example
 * truncateUrl('https://example.com/a/very/long/path/indeed', 30);
 * // 'https://example.com/a…/indeed'
 */
export function truncateUrl(url: string, maxLength = 60): string {
  if (url.length <= maxLength) return url;
  const keep = Math.floor((maxLength - 1) / 2);
  return `${url.slice(0, keep)}…${url.slice(-keep)}`;
}
