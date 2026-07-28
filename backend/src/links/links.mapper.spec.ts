/**
 * Unit tests for the link mapper.
 *
 * `isOwner` drives whether the UI shows edit and delete controls, and
 * `isLinkResolvable` decides whether a visitor gets a redirect or a 404 — both
 * are worth locking down.
 */

import type { Link } from '@prisma/client';
import { isLinkResolvable, toLinkDto, toLinkDtoList } from './links.mapper';

/**
 * Builds a link row for testing, with sensible defaults.
 *
 * @param overrides Fields to override on the base fixture.
 * @returns A complete `Link` row.
 */
function makeLink(overrides: Partial<Link> = {}): Link {
  return {
    id: 'link-1',
    slug: 'abc123',
    targetUrl: 'https://www.example.com/foo/bar',
    title: 'Example',
    isCustomSlug: false,
    visitCount: 5,
    lastVisitedAt: null,
    isActive: true,
    expiresAt: null,
    ownerId: 'user-1',
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  };
}

describe('toLinkDto', () => {
  it('builds the absolute short URL from the configured base', () => {
    expect(toLinkDto(makeLink(), 'https://short.ly').shortUrl).toBe('https://short.ly/abc123');
  });

  it('derives the destination domain without the www prefix', () => {
    expect(toLinkDto(makeLink(), 'https://short.ly').domain).toBe('example.com');
  });

  it('marks the owner as such', () => {
    expect(toLinkDto(makeLink(), 'https://short.ly', 'user-1').isOwner).toBe(true);
  });

  it('does not mark a different user as the owner', () => {
    expect(toLinkDto(makeLink(), 'https://short.ly', 'user-2').isOwner).toBe(false);
  });

  it('treats anonymous viewers as non-owners', () => {
    expect(toLinkDto(makeLink(), 'https://short.ly').isOwner).toBe(false);
  });

  it('never treats an anonymous link as owned, even by a signed-in viewer', () => {
    const anonymous = makeLink({ ownerId: null });
    expect(toLinkDto(anonymous, 'https://short.ly', 'user-1').isOwner).toBe(false);
  });

  it('does not leak ownerId into the response', () => {
    expect(toLinkDto(makeLink(), 'https://short.ly')).not.toHaveProperty('ownerId');
  });
});

describe('toLinkDtoList', () => {
  it('maps every row', () => {
    const result = toLinkDtoList([makeLink(), makeLink({ id: 'link-2', slug: 'xyz789' })], 'https://s.ly');
    expect(result.map((link) => link.shortUrl)).toEqual(['https://s.ly/abc123', 'https://s.ly/xyz789']);
  });
});

describe('isLinkResolvable', () => {
  const now = new Date('2026-07-27T12:00:00Z');

  it('resolves an active link with no expiry', () => {
    expect(isLinkResolvable({ isActive: true, expiresAt: null }, now)).toBe(true);
  });

  it('refuses a disabled link', () => {
    expect(isLinkResolvable({ isActive: false, expiresAt: null }, now)).toBe(false);
  });

  it('refuses an expired link', () => {
    expect(isLinkResolvable({ isActive: true, expiresAt: new Date('2026-07-01T00:00:00Z') }, now)).toBe(
      false,
    );
  });

  it('resolves a link whose expiry is still in the future', () => {
    expect(isLinkResolvable({ isActive: true, expiresAt: new Date('2026-12-31T00:00:00Z') }, now)).toBe(
      true,
    );
  });

  it('treats the exact expiry instant as expired', () => {
    expect(isLinkResolvable({ isActive: true, expiresAt: now }, now)).toBe(false);
  });
});
