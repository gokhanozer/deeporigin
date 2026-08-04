/**
 * Derived state for a link.
 *
 * These predicates live here rather than inline in a component because more
 * than one view renders the same badges, and a link that shows as "expired" in
 * one list and healthy in another is worse than showing nothing at all.
 */

import type { Link } from './types';

/**
 * Whether a link's expiry has passed.
 *
 * `expiresAt` is optional: a link without one never expires.
 *
 * @param link The link to check.
 * @returns `true` when the link has an expiry that is in the past.
 */
export function isExpired(link: Pick<Link, 'expiresAt'>): boolean {
  return link.expiresAt !== null && new Date(link.expiresAt) <= new Date();
}

/**
 * Whether a link will still redirect.
 *
 * A link stops working for either of two independent reasons — its owner
 * switched it off, or it expired — and callers almost always care about the
 * combination rather than the individual causes.
 *
 * @param link The link to check.
 * @returns `true` when the link is active and unexpired.
 */
export function isLive(link: Pick<Link, 'isActive' | 'expiresAt'>): boolean {
  return link.isActive && !isExpired(link);
}

/** How a link's ownership is described to the person looking at it. */
export type OwnerLabel = 'You' | 'Anonymous' | 'Another user';

/**
 * Describes who owns a link, from the current viewer's perspective.
 *
 * Three states rather than two: `isOwner: false` covers both "created without
 * an account" and "belongs to someone else", which read very differently to
 * someone scanning a list. No detail about the other user is available or
 * shown — only that the link is spoken for.
 *
 * @param link The link to describe.
 * @returns The label to display.
 */
export function ownerLabel(link: Pick<Link, 'isOwner' | 'isAnonymous'>): OwnerLabel {
  if (link.isOwner) return 'You';
  if (link.isAnonymous) return 'Anonymous';
  return 'Another user';
}
