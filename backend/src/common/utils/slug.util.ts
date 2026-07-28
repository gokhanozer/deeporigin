/**
 * Slug generation and validation.
 *
 * Pure functions with no framework or database dependencies, so they are
 * trivially unit-testable and reusable from anywhere (services, seed scripts,
 * CLI tooling).
 */

import { randomInt } from 'node:crypto';
import {
  SLUG_ALPHABET,
  SLUG_MAX_LENGTH,
  SLUG_MIN_LENGTH,
  SLUG_PATTERN,
} from '../constants/app.constants';
import { isReservedSlug } from '../constants/reserved-slugs.constant';

/** Structured outcome of a slug validation check. */
export interface SlugValidationResult {
  /** `true` when the slug is safe to persist. */
  valid: boolean;
  /** Human-readable explanation, present only when `valid` is `false`. */
  reason?: string;
}

/**
 * Generates a cryptographically random slug.
 *
 * Uses `crypto.randomInt` rather than `Math.random`: slugs are effectively
 * public identifiers, and a predictable sequence would let anyone enumerate
 * every link in the system.
 *
 * Collision probability is governed by the alphabet size (62) and the length:
 * a 7-character slug spans 62^7 ≈ 3.5 × 10^12 values, so collisions stay
 * negligible well into the millions of links. The caller still retries on the
 * unique-constraint violation, which makes correctness independent of luck.
 *
 * @param length Number of characters to generate. Defaults to 7.
 * @returns A random slug such as `k3Xq9pA`.
 * @throws {RangeError} If `length` falls outside the permitted slug bounds.
 *
 * @example
 * generateSlug();   // 'k3Xq9pA'
 * generateSlug(4);  // 'B7fz'
 */
export function generateSlug(length = 7): string {
  if (length < SLUG_MIN_LENGTH || length > SLUG_MAX_LENGTH) {
    throw new RangeError(
      `Slug length must be between ${SLUG_MIN_LENGTH} and ${SLUG_MAX_LENGTH}, received ${length}`,
    );
  }

  let slug = '';
  for (let index = 0; index < length; index += 1) {
    slug += SLUG_ALPHABET[randomInt(0, SLUG_ALPHABET.length)];
  }
  return slug;
}

/**
 * Generates a slug that is guaranteed not to be reserved.
 *
 * A generated slug can theoretically come out as a reserved word (for short
 * lengths), so we re-roll until it is usable.
 *
 * @param length Number of characters to generate.
 * @returns A random, non-reserved slug.
 */
export function generateUsableSlug(length = 7): string {
  let slug = generateSlug(length);
  while (isReservedSlug(slug)) {
    slug = generateSlug(length);
  }
  return slug;
}

/**
 * Validates a user-supplied custom slug against every rule at once.
 *
 * Returns a result object rather than throwing, so callers can decide whether
 * the failure is a `400` (API) or an inline form message (UI) without catching.
 *
 * @param slug Raw slug from user input.
 * @returns `{ valid: true }`, or `{ valid: false, reason }` explaining the failure.
 *
 * @example
 * validateSlug('my-link');   // { valid: true }
 * validateSlug('my link');   // { valid: false, reason: 'Slug may only contain…' }
 * validateSlug('dashboard'); // { valid: false, reason: '"dashboard" is reserved' }
 */
export function validateSlug(slug: string): SlugValidationResult {
  const candidate = slug.trim();

  if (candidate.length === 0) {
    return { valid: false, reason: 'Slug cannot be empty' };
  }
  if (candidate.length < SLUG_MIN_LENGTH) {
    return { valid: false, reason: `Slug must be at least ${SLUG_MIN_LENGTH} characters` };
  }
  if (candidate.length > SLUG_MAX_LENGTH) {
    return { valid: false, reason: `Slug must be at most ${SLUG_MAX_LENGTH} characters` };
  }
  if (!SLUG_PATTERN.test(candidate)) {
    return {
      valid: false,
      reason: 'Slug may only contain letters, numbers, hyphens and underscores',
    };
  }
  if (isReservedSlug(candidate)) {
    return { valid: false, reason: `"${candidate}" is a reserved word and cannot be used` };
  }

  return { valid: true };
}

/**
 * Normalises a slug for storage and lookup.
 *
 * Slugs are treated as **case-sensitive** (so `abc123` and `ABC123` are
 * distinct, maximising the keyspace); normalisation therefore only strips
 * surrounding whitespace and any leading slash a user may have pasted.
 *
 * @param slug Raw slug from user input or a URL path.
 * @returns The cleaned slug.
 *
 * @example
 * normalizeSlug('  /my-link ');  // 'my-link'
 */
export function normalizeSlug(slug: string): string {
  return slug.trim().replace(/^\/+/, '');
}

/**
 * Convenience predicate wrapping {@link validateSlug}.
 *
 * @param slug Candidate slug.
 * @returns `true` when the slug passes every rule.
 */
export function isValidSlug(slug: string): boolean {
  return validateSlug(slug).valid;
}
