/**
 * Password hashing and strength checking.
 *
 * Isolated from `AuthService` so the rules can be unit-tested directly and
 * reused by seed scripts or a future "change password" flow.
 */

import { compare, hash } from 'bcryptjs';

/** Minimum password length we accept. */
export const MIN_PASSWORD_LENGTH = 8;

/** Maximum password length. bcrypt silently truncates beyond 72 bytes. */
export const MAX_PASSWORD_LENGTH = 72;

/** Outcome of a password strength check. */
export interface PasswordValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Hashes a plaintext password with bcrypt.
 *
 * bcrypt is deliberately slow and salts each hash automatically, so identical
 * passwords produce different digests and offline cracking stays expensive.
 *
 * @param plaintext The user's password.
 * @param rounds    Cost factor; higher is slower and stronger. Defaults to 10.
 * @returns The bcrypt hash, safe to persist.
 */
export function hashPassword(plaintext: string, rounds = 10): Promise<string> {
  return hash(plaintext, rounds);
}

/**
 * Verifies a plaintext password against a stored hash.
 *
 * bcrypt's `compare` is constant-time with respect to the hash, which prevents
 * timing attacks from revealing how much of a guess was correct.
 *
 * @param plaintext  Candidate password.
 * @param hashedValue Stored bcrypt hash.
 * @returns `true` when the password matches.
 */
export function verifyPassword(plaintext: string, hashedValue: string): Promise<boolean> {
  return compare(plaintext, hashedValue);
}

/**
 * Checks a password against the minimum strength policy.
 *
 * Length is weighted over character-class rules deliberately: modern guidance
 * (NIST SP 800-63B) finds forced symbol/case mixing produces predictable
 * substitutions without meaningfully raising entropy.
 *
 * @param password Candidate password.
 * @returns `{ valid: true }` or a reason for rejection.
 */
export function validatePasswordStrength(password: string): PasswordValidationResult {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { valid: false, reason: `Password must be at most ${MAX_PASSWORD_LENGTH} characters` };
  }
  if (/^\s+$/.test(password)) {
    return { valid: false, reason: 'Password cannot be only whitespace' };
  }
  return { valid: true };
}

/**
 * Canonicalises an email address for storage and lookup.
 *
 * Lower-casing and trimming makes `Foo@Example.com ` and `foo@example.com` the
 * same account, which is what users expect and what the unique index requires.
 *
 * @param email Raw email input.
 * @returns The normalised email.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
