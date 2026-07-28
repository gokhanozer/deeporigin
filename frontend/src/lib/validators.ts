/**
 * Client-side input validation.
 *
 * These rules intentionally mirror the backend's. The duplication is not an
 * oversight: client-side checks exist to give instant feedback while typing,
 * and the server re-validates everything because a browser check is only a
 * convenience and can be bypassed trivially. The server remains the authority.
 */

/** Minimum length of a custom slug. Mirrors the backend constant. */
export const SLUG_MIN_LENGTH = 3;

/** Maximum length of a custom slug. */
export const SLUG_MAX_LENGTH = 32;

/** Characters permitted in a slug. */
export const SLUG_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** Maximum accepted destination URL length. */
export const MAX_URL_LENGTH = 2048;

/** Minimum password length. Mirrors the backend policy. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Slugs that shadow real application routes.
 * Kept in sync with `backend/src/common/constants/reserved-slugs.constant.ts`.
 */
const RESERVED_SLUGS = new Set([
  'login', 'logout', 'register', 'signup', 'signin', 'dashboard', 'links',
  'analytics', 'settings', 'account', 'profile', 'admin', 'new', 'edit',
  'delete', 'api', 'health', 'healthz', 'status', 'metrics', 'docs', 'static',
  'assets', 'public', '_next', 'about', 'help', 'support', 'terms', 'privacy',
  'contact', 'pricing', 'home', 'index', '404', '500',
]);

/** Outcome of a validation check. */
export interface ValidationResult {
  valid: boolean;
  /** Message to show beneath the field when invalid. */
  reason?: string;
}

/** A passing result, reused to avoid allocating identical objects. */
const VALID: ValidationResult = { valid: true };

/**
 * Adds `https://` when the user omitted a scheme.
 *
 * @param input Raw input.
 * @returns The input with a scheme.
 */
export function ensureProtocol(input: string): string {
  const trimmed = input.trim();
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return `https://${trimmed}`;
}

/**
 * Validates a destination URL for immediate form feedback.
 *
 * Uses the browser's own `URL` parser rather than a regex, so the rules match
 * what the browser (and the backend) actually consider a URL.
 *
 * @param input Raw URL input.
 * @returns Whether it is acceptable, with a reason when not.
 *
 * @example
 * validateUrl('example.com');       // { valid: true }
 * validateUrl('not a url');         // { valid: false, reason: 'Please enter a valid URL' }
 */
export function validateUrl(input: string): ValidationResult {
  const raw = input.trim();

  if (raw.length === 0) return { valid: false, reason: 'Please enter a URL' };
  if (raw.length > MAX_URL_LENGTH) {
    return { valid: false, reason: `URL must be at most ${MAX_URL_LENGTH} characters` };
  }

  let parsed: URL;
  try {
    parsed = new URL(ensureProtocol(raw));
  } catch {
    return { valid: false, reason: 'Please enter a valid URL' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: 'Only http and https URLs are supported' };
  }

  const isIpLiteral = /^\d{1,3}(\.\d{1,3}){3}$/.test(parsed.hostname);
  if (!parsed.hostname.includes('.') && !isIpLiteral && parsed.hostname !== 'localhost') {
    return { valid: false, reason: 'Please enter a valid URL, for example https://example.com' };
  }

  return VALID;
}

/**
 * Validates a custom slug.
 *
 * @param slug Raw slug input.
 * @returns Whether it is acceptable, with a reason when not.
 */
export function validateSlug(slug: string): ValidationResult {
  const candidate = slug.trim();

  if (candidate.length === 0) return { valid: false, reason: 'Slug cannot be empty' };
  if (candidate.length < SLUG_MIN_LENGTH) {
    return { valid: false, reason: `Slug must be at least ${SLUG_MIN_LENGTH} characters` };
  }
  if (candidate.length > SLUG_MAX_LENGTH) {
    return { valid: false, reason: `Slug must be at most ${SLUG_MAX_LENGTH} characters` };
  }
  if (!SLUG_PATTERN.test(candidate)) {
    return { valid: false, reason: 'Use only letters, numbers, hyphens and underscores' };
  }
  if (RESERVED_SLUGS.has(candidate.toLowerCase())) {
    return { valid: false, reason: `"${candidate}" is reserved` };
  }

  return VALID;
}

/**
 * Validates an email address.
 *
 * A deliberately permissive pattern: the only authoritative test of an email
 * address is sending mail to it, and over-strict regexes reject valid
 * addresses (plus-tags, new TLDs, unicode domains).
 *
 * @param email Raw email input.
 * @returns Whether it looks like an email address.
 */
export function validateEmail(email: string): ValidationResult {
  const candidate = email.trim();
  if (candidate.length === 0) return { valid: false, reason: 'Email is required' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) {
    return { valid: false, reason: 'Please enter a valid email address' };
  }
  return VALID;
}

/**
 * Validates a password against the minimum policy.
 *
 * @param password Raw password input.
 * @returns Whether it meets the policy.
 */
export function validatePassword(password: string): ValidationResult {
  if (password.length === 0) return { valid: false, reason: 'Password is required' };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  return VALID;
}
