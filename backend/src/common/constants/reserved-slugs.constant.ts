/**
 * Slugs that may never be handed out.
 *
 * Short links are served from the site root (`https://short.ly/<slug>`), so a
 * slug that collides with a real page — `login`, `dashboard`, `api` — would
 * shadow that page and create a permanently broken route. Both the auto
 * generator and the custom-slug validator consult this set, so the rule is
 * enforced in exactly one place.
 */

/**
 * Reserved words, stored lower-cased. A `Set` gives O(1) membership tests.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // Application routes owned by the frontend.
  'login',
  'logout',
  'register',
  'signup',
  'signin',
  'dashboard',
  'links',
  'analytics',
  'settings',
  'account',
  'profile',
  'admin',
  'new',
  'edit',
  'delete',
  // Infrastructure and well-known paths.
  'api',
  'health',
  'healthz',
  'status',
  'metrics',
  'docs',
  'static',
  'assets',
  'public',
  '_next',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  'well-known',
  // Generic pages people expect to exist.
  'about',
  'help',
  'support',
  'terms',
  'privacy',
  'contact',
  'pricing',
  'home',
  'index',
  '404',
  '500',
]);

/**
 * Reports whether a slug is reserved.
 *
 * @param slug Candidate slug, in any casing.
 * @returns `true` when the slug must be rejected.
 *
 * @example
 * isReservedSlug('Dashboard'); // true
 * isReservedSlug('abc123');    // false
 */
export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.trim().toLowerCase());
}
