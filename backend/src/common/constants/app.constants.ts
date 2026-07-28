/**
 * Cross-cutting constants shared by validators, DTOs and services.
 *
 * Centralising these means the API contract, the database constraints and the
 * error messages shown to users can never drift apart.
 */

/** Alphabet used for generated slugs. */
export const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Shortest slug a user may choose. Below this, the keyspace is too small. */
export const SLUG_MIN_LENGTH = 3;

/** Longest permitted slug — long enough to be memorable, short enough to be "short". */
export const SLUG_MAX_LENGTH = 32;

/**
 * Characters allowed in a custom slug: letters, digits, hyphen and underscore.
 * Deliberately excludes `.` and `/` so a slug can never alter the URL's shape.
 */
export const SLUG_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** Maximum accepted length of a destination URL (comfortably above real-world URLs). */
export const MAX_URL_LENGTH = 2048;

/** Maximum length of the optional human-readable link title. */
export const MAX_TITLE_LENGTH = 120;

/** URL schemes we are willing to redirect to. `javascript:` and `data:` are never allowed. */
export const ALLOWED_URL_PROTOCOLS: readonly string[] = ['http:', 'https:'];

/** Default page size for paginated list endpoints. */
export const DEFAULT_PAGE_SIZE = 20;

/** Upper bound on page size, so a client cannot request the entire table at once. */
export const MAX_PAGE_SIZE = 100;

/** Default look-back window, in days, for analytics time-series. */
export const DEFAULT_ANALYTICS_DAYS = 30;

/** Maximum look-back window, in days, for analytics time-series. */
export const MAX_ANALYTICS_DAYS = 365;
