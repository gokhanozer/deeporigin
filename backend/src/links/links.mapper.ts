/**
 * Database row → API response mapping for links.
 *
 * Kept as standalone pure functions (rather than methods on the service) so
 * they can be reused by any module that returns links, and unit-tested with
 * plain object literals and no DI container.
 */

import type { Link } from '@prisma/client';
import { buildShortUrl, extractDomain } from '../common/utils/url.util';
import type { LinkResponseDto } from './dto/link.dto';

/**
 * Converts a link row into its public API representation.
 *
 * Two things happen here that clients should never have to do themselves:
 * the short URL is assembled from the configured public base, and ownership is
 * resolved into a simple `isOwner` boolean so the UI can decide whether to show
 * edit controls without ever seeing another user's `ownerId`.
 *
 * @param link          The database row.
 * @param publicBaseUrl Configured public base URL for short links.
 * @param viewerId      ID of the requesting user, or `undefined` when anonymous.
 * @returns The API-facing link object.
 *
 * @example
 * toLinkDto(row, 'https://short.ly', 'user-1');
 * // { slug: 'abc123', shortUrl: 'https://short.ly/abc123', isOwner: true, … }
 */
export function toLinkDto(
  link: Link,
  publicBaseUrl: string,
  viewerId?: string,
): LinkResponseDto {
  return {
    id: link.id,
    slug: link.slug,
    shortUrl: buildShortUrl(publicBaseUrl, link.slug),
    targetUrl: link.targetUrl,
    domain: extractDomain(link.targetUrl),
    title: link.title,
    visitCount: link.visitCount,
    lastVisitedAt: link.lastVisitedAt,
    isActive: link.isActive,
    isCustomSlug: link.isCustomSlug,
    expiresAt: link.expiresAt,
    // `ownerId` itself is never exposed — only whether it matches the viewer.
    isOwner: Boolean(viewerId && link.ownerId === viewerId),
    // Reported rather than re-derived by the client: `isOwner: false` covers
    // both "someone else's link" (private) and "an anonymous link" (public),
    // which need opposite treatment in the UI.
    canViewAnalytics: canViewLinkAnalytics(link, viewerId),
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };
}

/**
 * Maps a list of link rows through {@link toLinkDto}.
 *
 * @param links         Database rows.
 * @param publicBaseUrl Configured public base URL.
 * @param viewerId      Requesting user's ID, if any.
 * @returns The API-facing link objects.
 */
export function toLinkDtoList(
  links: Link[],
  publicBaseUrl: string,
  viewerId?: string,
): LinkResponseDto[] {
  return links.map((link) => toLinkDto(link, publicBaseUrl, viewerId));
}

/**
 * Determines whether a link is currently resolvable.
 *
 * Shared by the redirect path and the analytics views so "expired" means
 * exactly the same thing everywhere.
 *
 * @param link The link to test.
 * @param now  Reference time. Defaults to the current instant.
 * @returns `true` when the link should redirect.
 */
export function isLinkResolvable(
  link: Pick<Link, 'isActive' | 'expiresAt'>,
  now: Date = new Date(),
): boolean {
  if (!link.isActive) return false;
  if (link.expiresAt && link.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

/**
 * Determines whether a viewer may read a link's analytics.
 *
 * Two cases qualify, and the second is easy to miss: an **anonymous** link has
 * no owner to keep it private, and it is already listed publicly with its visit
 * count, so its breakdowns are not a secret either. An **owned** link is
 * private to its owner.
 *
 * Shared by the analytics endpoint, which enforces it, and the link mapper,
 * which reports it — so the UI never offers a link to a page that would answer
 * `403`, and never hides one that would have worked.
 *
 * @param link     The link to test.
 * @param viewerId Requesting user's ID, if authenticated.
 * @returns `true` when the viewer may read this link's analytics.
 */
export function canViewLinkAnalytics(
  link: Pick<Link, 'ownerId'>,
  viewerId?: string,
): boolean {
  if (!link.ownerId) return true;
  return link.ownerId === viewerId;
}
