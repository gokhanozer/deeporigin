/**
 * Unit tests for the link mapper.
 *
 * `isOwner` drives whether the UI shows edit and delete controls, and
 * `isLinkResolvable` decides whether a visitor gets a redirect or a 404 — both
 * are worth locking down.
 */

import type { Link } from '@prisma/client';
import { canViewLinkAnalytics, isLinkResolvable, toLinkDto, toLinkDtoList } from './links.mapper';

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



  describe('ownership flags', () => {
    it('marks a link created without an account as anonymous', () => {
      const dto = toLinkDto(makeLink({ ownerId: null }), 'https://short.ly');
      expect(dto.isAnonymous).toBe(true);
      expect(dto.isOwner).toBe(false);
    });

    it("distinguishes another user's link from an anonymous one", () => {
      // Both are `isOwner: false`, and they read very differently in a list.
      const dto = toLinkDto(makeLink({ ownerId: 'user-1' }), 'https://short.ly', 'user-2');
      expect(dto.isAnonymous).toBe(false);
      expect(dto.isOwner).toBe(false);
    });

    it('marks the viewer as the owner of their own link', () => {
      const dto = toLinkDto(makeLink({ ownerId: 'user-1' }), 'https://short.ly', 'user-1');
      expect(dto.isOwner).toBe(true);
      expect(dto.isAnonymous).toBe(false);
    });

    it('never exposes the owner id itself', () => {
      const dto = toLinkDto(makeLink({ ownerId: 'user-1' }), 'https://short.ly', 'user-2');
      expect(JSON.stringify(dto)).not.toContain('user-1');
    });
  });

  describe('canViewLinkAnalytics', () => {
    it("lets anyone read an anonymous link's analytics", () => {
      expect(canViewLinkAnalytics({ ownerId: null })).toBe(true);
      expect(canViewLinkAnalytics({ ownerId: null }, 'user-1')).toBe(true);
    });

    it('lets an owner read their own link', () => {
      expect(canViewLinkAnalytics({ ownerId: 'user-1' }, 'user-1')).toBe(true);
    });

    it("refuses another user's link", () => {
      expect(canViewLinkAnalytics({ ownerId: 'user-1' }, 'user-2')).toBe(false);
      expect(canViewLinkAnalytics({ ownerId: 'user-1' })).toBe(false);
    });

    it('is reported on the DTO so the UI matches what the API enforces', () => {
      const anon = toLinkDto(makeLink({ ownerId: null }), 'https://short.ly');
      const theirs = toLinkDto(makeLink({ ownerId: 'user-1' }), 'https://short.ly', 'user-2');
      const mine = toLinkDto(makeLink({ ownerId: 'user-1' }), 'https://short.ly', 'user-1');

      expect(anon.canViewAnalytics).toBe(true);
      expect(theirs.canViewAnalytics).toBe(false);
      expect(mine.canViewAnalytics).toBe(true);
    });
  });
});
