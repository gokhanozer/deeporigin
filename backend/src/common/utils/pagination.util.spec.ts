/**
 * Unit tests for the pagination helpers.
 *
 * The clamping rules protect the database from hostile input (`pageSize=99999`),
 * so they are asserted explicitly rather than assumed.
 */

import {
  buildPaginatedResult,
  buildPaginationMeta,
  normalizePage,
  normalizePageSize,
  toSkipTake,
} from './pagination.util';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants/app.constants';

describe('normalizePage', () => {
  it('defaults to 1 for missing or invalid input', () => {
    expect(normalizePage(undefined)).toBe(1);
    expect(normalizePage(0)).toBe(1);
    expect(normalizePage(-5)).toBe(1);
    expect(normalizePage(Number.NaN)).toBe(1);
  });

  it('passes valid pages through, flooring fractions', () => {
    expect(normalizePage(3)).toBe(3);
    expect(normalizePage(2.7)).toBe(2);
  });
});

describe('normalizePageSize', () => {
  it('falls back to the default when absent or invalid', () => {
    expect(normalizePageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
    expect(normalizePageSize(0)).toBe(DEFAULT_PAGE_SIZE);
  });

  it('caps oversized requests', () => {
    expect(normalizePageSize(10_000)).toBe(MAX_PAGE_SIZE);
  });

  it('allows sizes within range', () => {
    expect(normalizePageSize(50)).toBe(50);
  });
});

describe('toSkipTake', () => {
  it('computes the offset for a page', () => {
    expect(toSkipTake(1, 20)).toEqual({ skip: 0, take: 20 });
    expect(toSkipTake(3, 20)).toEqual({ skip: 40, take: 20 });
  });

  it('never produces a negative offset from bad input', () => {
    expect(toSkipTake(-1, -1).skip).toBe(0);
  });
});

describe('buildPaginationMeta', () => {
  it('describes a middle page correctly', () => {
    expect(buildPaginationMeta(2, 20, 45)).toEqual({
      page: 2,
      pageSize: 20,
      total: 45,
      totalPages: 3,
      hasNext: true,
      hasPrevious: true,
    });
  });

  it('reports no next page on the last page', () => {
    expect(buildPaginationMeta(3, 20, 45)).toMatchObject({ hasNext: false, hasPrevious: true });
  });

  it('reports a single empty page when there are no results', () => {
    expect(buildPaginationMeta(1, 20, 0)).toMatchObject({
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    });
  });

  it('handles a total that divides exactly', () => {
    expect(buildPaginationMeta(2, 10, 20)).toMatchObject({ totalPages: 2, hasNext: false });
  });
});

describe('buildPaginatedResult', () => {
  it('wraps rows and metadata in the standard envelope', () => {
    const result = buildPaginatedResult(['a', 'b'], 2, 1, 20);
    expect(result.data).toEqual(['a', 'b']);
    expect(result.meta.total).toBe(2);
  });
});
