/**
 * Query-DTO transformation tests.
 *
 * Regression coverage for a genuine bug: `ListLinksQueryDto.mineOnly` carried
 * both `@Type(() => Boolean)` and `@Transform(...)`. `@Type` runs first, and
 * `Boolean('false')` is **`true`** — every non-empty string is truthy — so
 * `?mineOnly=false` was parsed as `true`. Anonymous callers then got
 * `403 You must be signed in to view your links` while explicitly asking for
 * the public list.
 *
 * Query strings are always strings, so these tests feed the DTO exactly what
 * Express hands it, rather than pre-coerced values that would hide the fault.
 */

import { plainToInstance } from 'class-transformer';
import { ListLinksQueryDto } from './link.dto';

/**
 * Runs a raw query object through the same transformation the ValidationPipe
 * applies.
 *
 * @param query Raw query parameters, as strings.
 * @returns The transformed DTO.
 */
function transform(query: Record<string, unknown>): ListLinksQueryDto {
  return plainToInstance(ListLinksQueryDto, query, { enableImplicitConversion: false });
}

describe('ListLinksQueryDto', () => {
  describe('mineOnly', () => {
    it('treats the string "false" as false', () => {
      // The bug: Boolean('false') === true, so this returned true and caused a
      // 403 for anonymous callers asking for the public list.
      expect(transform({ mineOnly: 'false' }).mineOnly).toBe(false);
    });

    it('treats the string "true" as true', () => {
      expect(transform({ mineOnly: 'true' }).mineOnly).toBe(true);
    });

    it('defaults to false when absent', () => {
      expect(transform({}).mineOnly).toBe(false);
    });

    it.each(['0', '1', 'yes', 'no', '', 'TRUE', 'False'])(
      'treats the unrecognised value %p as false',
      (value) => {
        // Only the exact string 'true' may enable an owner-scoped query.
        // Anything else must fail closed, never open.
        expect(transform({ mineOnly: value }).mineOnly).toBe(false);
      },
    );

    it('accepts a real boolean true', () => {
      expect(transform({ mineOnly: true }).mineOnly).toBe(true);
    });

    it('accepts a real boolean false', () => {
      expect(transform({ mineOnly: false }).mineOnly).toBe(false);
    });
  });

  describe('numeric fields', () => {
    it('converts page and pageSize from strings', () => {
      const dto = transform({ page: '3', pageSize: '25' });
      expect(dto.page).toBe(3);
      expect(dto.pageSize).toBe(25);
      // `@Type(() => Number)` IS correct for these: Number('3') === 3, whereas
      // Boolean('false') === true. The coercion is only safe when the target
      // type's constructor actually parses the string.
      expect(typeof dto.page).toBe('number');
    });

    it('applies defaults when absent', () => {
      const dto = transform({});
      expect(dto.page).toBe(1);
      expect(dto.pageSize).toBe(20);
    });
  });

  describe('sort defaults', () => {
    it('defaults to newest first', () => {
      const dto = transform({});
      expect(dto.sortBy).toBe('createdAt');
      expect(dto.sortOrder).toBe('desc');
    });
  });
});
