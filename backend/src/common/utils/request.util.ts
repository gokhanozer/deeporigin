/**
 * Helpers for pulling trustworthy metadata out of an inbound HTTP request.
 *
 * Behind a proxy (nginx, a load balancer, Docker) `req.ip` is the proxy's
 * address, so both rate limiting and visit analytics would otherwise see every
 * request as coming from one client. These helpers resolve the real client
 * address and reduce it to privacy-preserving derivatives.
 */

import { createHash } from 'node:crypto';
import type { Request } from 'express';

/**
 * Resolves the originating client IP address.
 *
 * Precedence: `X-Forwarded-For` (first entry — the client, subsequent entries
 * are proxies) → `X-Real-IP` → the socket address.
 *
 * ⚠️ `X-Forwarded-For` is client-supplied and trivially spoofed. It must only
 * be trusted when the app genuinely sits behind a proxy that overwrites it,
 * which is why Express' `trust proxy` setting is enabled explicitly in
 * `main.ts` rather than left on by default.
 *
 * @param request Express request object.
 * @returns The best-guess client IP, or `'unknown'` when none can be determined.
 *
 * @example
 * extractClientIp(req); // '203.0.113.7'
 */
export function extractClientIp(request: Request): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const [first] = forwarded.split(',');
    if (first?.trim()) return first.trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].split(',')[0].trim();
  }

  const realIp = request.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.length > 0) return realIp.trim();

  return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
}

/**
 * Hashes an IP address with a server-side salt.
 *
 * Storing raw IPs would make the `visits` table personal data under GDPR while
 * adding nothing: the dashboard only needs to know whether two visits came from
 * the *same* client, which a stable hash answers. The salt is what stops an
 * attacker with database access from brute-forcing the (tiny) IPv4 keyspace.
 *
 * @param ip   Client IP address.
 * @param salt Server-side secret from configuration.
 * @returns A hex SHA-256 digest, truncated to 32 characters.
 *
 * @example
 * hashIp('203.0.113.7', 'salt'); // 'e3b0c44298fc1c149afbf4c8996fb924'
 */
export function hashIp(ip: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

/**
 * Extracts the referring *host* from a `Referer` header.
 *
 * Only the host is kept — full referrer URLs can carry session tokens and
 * other sensitive path/query data that we have no reason to store.
 *
 * @param referer Raw `Referer` header value.
 * @returns The referring hostname, or `null` for direct traffic / unparseable input.
 *
 * @example
 * extractReferrerHost('https://t.co/abc?utm=x'); // 't.co'
 */
export function extractReferrerHost(referer: string | undefined | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).hostname.replace(/^www\./i, '') || null;
  } catch {
    return null;
  }
}

/**
 * Reads the `User-Agent` header as a plain string.
 *
 * @param request Express request object.
 * @returns The header value, or `null` when absent.
 */
export function extractUserAgent(request: Request): string | null {
  const ua = request.headers['user-agent'];
  return typeof ua === 'string' && ua.length > 0 ? ua : null;
}
