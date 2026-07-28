/**
 * Access-token persistence.
 *
 * ⚠️ Security trade-off, stated plainly: the JWT lives in `localStorage`, which
 * means any successful XSS on this origin can read it. The more secure option
 * is an httpOnly, SameSite=Strict cookie that JavaScript cannot touch — but
 * that requires the API and the frontend to share a registrable domain and adds
 * a CSRF-token flow, which is disproportionate for this exercise.
 *
 * The choice is contained entirely within this module: switching to cookies
 * means rewriting these four functions and nothing else in the app.
 */

/** Storage key. Namespaced to avoid clashing with anything else on the origin. */
const TOKEN_KEY = 'deeporigin.shortener.token';

/**
 * Reports whether code is currently running in a browser.
 *
 * Next.js renders components on the server first, where `localStorage` does not
 * exist; touching it unguarded would crash server rendering.
 *
 * @returns `true` when `window` is available.
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Reads the stored access token.
 *
 * @returns The token, or `null` when absent or unavailable.
 */
export function getStoredToken(): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    // Safari in private mode, or a user who has disabled site data.
    return null;
  }
}

/**
 * Persists an access token.
 *
 * @param token The token to store.
 */
export function setStoredToken(token: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Non-fatal: the session simply will not survive a page reload.
  }
}

/**
 * Removes the stored access token (sign-out).
 */
export function clearStoredToken(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing useful to do here.
  }
}
