/**
 * Unit tests for the slug helpers.
 *
 * These functions decide what ends up in a public URL and guard a unique
 * database index, so their edge cases are worth pinning down explicitly.
 */

import {
  generateSlug,
  generateUsableSlug,
  isValidSlug,
  normalizeSlug,
  validateSlug,
} from './slug.util';
import { SLUG_PATTERN } from '../constants/app.constants';
import { isReservedSlug } from '../constants/reserved-slugs.constant';

describe('generateSlug', () => {
  it('produces a slug of the requested length', () => {
    expect(generateSlug(7)).toHaveLength(7);
    expect(generateSlug(12)).toHaveLength(12);
  });

  it('defaults to 7 characters', () => {
    expect(generateSlug()).toHaveLength(7);
  });

  it('only ever emits URL-safe characters', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateSlug(10)).toMatch(SLUG_PATTERN);
    }
  });

  it('rejects lengths outside the permitted bounds', () => {
    expect(() => generateSlug(2)).toThrow(RangeError);
    expect(() => generateSlug(100)).toThrow(RangeError);
  });

  it('is random enough to avoid collisions in practice', () => {
    // 1,000 draws from a 62^8 keyspace should never repeat. A failure here
    // would mean the RNG has been replaced with something non-random.
    const slugs = new Set(Array.from({ length: 1000 }, () => generateSlug(8)));
    expect(slugs.size).toBe(1000);
  });
});

describe('generateUsableSlug', () => {
  it('never returns a reserved word', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(isReservedSlug(generateUsableSlug(3))).toBe(false);
    }
  });
});

describe('validateSlug', () => {
  it.each(['abc', 'my-link', 'my_link', 'ABC123', 'a-b_c-1'])('accepts %s', (slug) => {
    expect(validateSlug(slug)).toEqual({ valid: true });
  });

  it('rejects an empty slug', () => {
    expect(validateSlug('   ')).toMatchObject({ valid: false });
  });

  it('rejects slugs that are too short or too long', () => {
    expect(validateSlug('ab').reason).toMatch(/at least/);
    expect(validateSlug('a'.repeat(33)).reason).toMatch(/at most/);
  });

  it.each(['my link', 'my/link', 'my.link', 'my?link', 'emoji-🎉'])(
    'rejects illegal characters in %s',
    (slug) => {
      expect(validateSlug(slug).reason).toMatch(/letters, numbers/);
    },
  );

  it('rejects reserved words regardless of casing', () => {
    expect(validateSlug('dashboard').reason).toMatch(/reserved/);
    expect(validateSlug('Dashboard').reason).toMatch(/reserved/);
    expect(validateSlug('API').reason).toMatch(/reserved/);
  });
});

describe('normalizeSlug', () => {
  it('trims whitespace and a leading slash', () => {
    expect(normalizeSlug('  /abc123 ')).toBe('abc123');
  });

  it('preserves case, since slugs are case-sensitive', () => {
    expect(normalizeSlug('AbC')).toBe('AbC');
  });
});

describe('isValidSlug', () => {
  it('mirrors validateSlug as a boolean', () => {
    expect(isValidSlug('good-slug')).toBe(true);
    expect(isValidSlug('login')).toBe(false);
  });
});
