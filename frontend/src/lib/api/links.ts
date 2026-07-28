/**
 * Link endpoints.
 *
 * A thin, named function per endpoint. Components call `listLinks(...)` rather
 * than assembling paths and query strings, which keeps API knowledge out of the
 * UI and makes a contract change a one-file edit.
 */

import { apiRequest } from '../api-client';
import type {
  CreateLinkPayload,
  Link,
  ListLinksParams,
  PaginatedResult,
  SlugAvailability,
  UpdateLinkPayload,
} from '../types';

/**
 * Creates a short link.
 *
 * Works anonymously; when a token is present the link is owned by that user.
 *
 * @param payload Destination URL plus optional slug, title and expiry.
 * @returns The created link, including its ready-to-copy `shortUrl`.
 */
export function createLink(payload: CreateLinkPayload): Promise<Link> {
  return apiRequest<Link>('/links', { method: 'POST', body: payload });
}

/**
 * Lists links with search, sorting and pagination.
 *
 * @param params Filter, sort and pagination options.
 * @returns A page of links plus pagination metadata.
 */
export function listLinks(params: ListLinksParams = {}): Promise<PaginatedResult<Link>> {
  return apiRequest<PaginatedResult<Link>>('/links', { query: { ...params } });
}

/**
 * Fetches a single link.
 *
 * @param id Link ID.
 * @returns The link.
 */
export function getLink(id: string): Promise<Link> {
  return apiRequest<Link>(`/links/${id}`);
}

/**
 * Updates a link — most commonly to change its slug.
 *
 * @param id      Link ID.
 * @param payload Fields to change.
 * @returns The updated link.
 */
export function updateLink(id: string, payload: UpdateLinkPayload): Promise<Link> {
  return apiRequest<Link>(`/links/${id}`, { method: 'PATCH', body: payload });
}

/**
 * Deletes a link and its recorded visits.
 *
 * @param id Link ID.
 */
export function deleteLink(id: string): Promise<void> {
  return apiRequest<void>(`/links/${id}`, { method: 'DELETE' });
}

/**
 * Checks whether a slug is free, for live feedback while typing.
 *
 * @param slug Candidate slug.
 * @returns Availability plus a reason when unavailable.
 */
export function checkSlugAvailability(slug: string): Promise<SlugAvailability> {
  return apiRequest<SlugAvailability>(`/links/slug-available/${encodeURIComponent(slug)}`);
}
