/**
 * Sort options for link lists.
 *
 * Shared by the `/links` page and the dashboard table so both offer the same
 * orderings under the same names. Each entry pairs a stable `value` for the
 * `<select>` with the two query parameters the API actually takes, which keeps
 * the mapping in one place rather than in every component that sorts.
 */

import type { LinkSortField } from './types';

/** One entry in the sort dropdown. */
export interface LinkSortOption {
  /** Stable identifier held in component state. */
  value: string;
  /** Text shown in the dropdown. */
  label: string;
  /** Column the API sorts on. */
  sortBy: LinkSortField;
  /** Direction the API sorts in. */
  sortOrder: 'asc' | 'desc';
}

/**
 * The orderings offered in the UI.
 *
 * A deliberate subset of what the API accepts — `slug` is sortable server-side
 * but nobody wants links alphabetically by slug, and every option here is
 * backed by an index (see `SCALING.md` §2.5).
 */
export const LINK_SORT_OPTIONS: ReadonlyArray<LinkSortOption> = [
  { value: 'popular', label: 'Most visited', sortBy: 'visitCount', sortOrder: 'desc' },
  { value: 'newest', label: 'Newest first', sortBy: 'createdAt', sortOrder: 'desc' },
  { value: 'oldest', label: 'Oldest first', sortBy: 'createdAt', sortOrder: 'asc' },
  { value: 'recent', label: 'Recently visited', sortBy: 'lastVisitedAt', sortOrder: 'desc' },
];

/**
 * Resolves a stored sort value to its query parameters.
 *
 * Falls back to the first option rather than throwing, so a stale value — from
 * an old bookmark or a renamed option — degrades to a sensible default instead
 * of breaking the page.
 *
 * @param value The `value` held in component state.
 * @returns The matching option, or the default.
 */
export function resolveLinkSort(value: string): LinkSortOption {
  return LINK_SORT_OPTIONS.find((option) => option.value === value) ?? LINK_SORT_OPTIONS[0];
}
