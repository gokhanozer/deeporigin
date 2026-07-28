/**
 * Offset-pagination helpers shared by every list endpoint.
 *
 * Keeping the arithmetic (and its edge cases: page 0, negative sizes, empty
 * result sets) in one tested place means each controller can stay a two-liner
 * and every endpoint returns an identically-shaped envelope.
 */

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants/app.constants';

/** Prisma-compatible `skip` / `take` pair. */
export interface SkipTake {
  skip: number;
  take: number;
}

/** Metadata describing the position of a page within a result set. */
export interface PaginationMeta {
  /** Current 1-based page number. */
  page: number;
  /** Number of items requested per page. */
  pageSize: number;
  /** Total number of matching items across all pages. */
  total: number;
  /** Total number of pages (at least 1, even when empty). */
  totalPages: number;
  /** `true` when a further page exists. */
  hasNext: boolean;
  /** `true` when a previous page exists. */
  hasPrevious: boolean;
}

/** Standard envelope returned by all paginated endpoints. */
export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

/**
 * Clamps a requested page number into a valid range.
 *
 * @param page Requested page (possibly `undefined`, `0` or negative).
 * @returns A 1-based page number, at least 1.
 */
export function normalizePage(page: number | undefined): number {
  if (!page || !Number.isFinite(page) || page < 1) return 1;
  return Math.floor(page);
}

/**
 * Clamps a requested page size into `[1, MAX_PAGE_SIZE]`.
 *
 * The upper bound is what stops a client from requesting the entire table in
 * a single query and exhausting server memory.
 *
 * @param pageSize Requested size (possibly `undefined` or out of range).
 * @returns A safe page size.
 */
export function normalizePageSize(pageSize: number | undefined): number {
  if (!pageSize || !Number.isFinite(pageSize) || pageSize < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(pageSize), MAX_PAGE_SIZE);
}

/**
 * Converts a page/pageSize pair into Prisma's `skip`/`take` arguments.
 *
 * @param page     1-based page number.
 * @param pageSize Items per page.
 * @returns `{ skip, take }` ready to spread into a Prisma query.
 *
 * @example
 * toSkipTake(3, 20); // { skip: 40, take: 20 }
 */
export function toSkipTake(page: number | undefined, pageSize: number | undefined): SkipTake {
  const safePage = normalizePage(page);
  const safeSize = normalizePageSize(pageSize);
  return { skip: (safePage - 1) * safeSize, take: safeSize };
}

/**
 * Builds the metadata block for a page of results.
 *
 * @param page     1-based page number that was served.
 * @param pageSize Items per page that was served.
 * @param total    Total number of matching rows.
 * @returns Fully-computed {@link PaginationMeta}.
 *
 * @example
 * buildPaginationMeta(1, 20, 45);
 * // { page: 1, pageSize: 20, total: 45, totalPages: 3, hasNext: true, hasPrevious: false }
 */
export function buildPaginationMeta(
  page: number | undefined,
  pageSize: number | undefined,
  total: number,
): PaginationMeta {
  const safePage = normalizePage(page);
  const safeSize = normalizePageSize(pageSize);
  const totalPages = Math.max(1, Math.ceil(total / safeSize));

  return {
    page: safePage,
    pageSize: safeSize,
    total,
    totalPages,
    hasNext: safePage < totalPages,
    hasPrevious: safePage > 1,
  };
}

/**
 * Wraps rows and their count into the standard paginated envelope.
 *
 * @param data     Rows for the current page.
 * @param total    Total number of matching rows.
 * @param page     1-based page number.
 * @param pageSize Items per page.
 * @returns A {@link PaginatedResult}.
 */
export function buildPaginatedResult<T>(
  data: T[],
  total: number,
  page: number | undefined,
  pageSize: number | undefined,
): PaginatedResult<T> {
  return { data, meta: buildPaginationMeta(page, pageSize, total) };
}
