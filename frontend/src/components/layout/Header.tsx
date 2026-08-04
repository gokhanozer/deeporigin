'use client';

/**
 * Application header: brand, primary navigation and the auth controls.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '../ui/Button';
import { useAuth } from '../../providers/AuthProvider';

/** Primary navigation entries. `authOnly` items are hidden when signed out. */
const NAV_ITEMS: ReadonlyArray<{ href: string; label: string; authOnly?: boolean }> = [
  { href: '/', label: 'Shorten' },
  { href: '/links', label: 'All links' },
  { href: '/dashboard', label: 'Dashboard' },
];

/**
 * Renders the sticky site header.
 *
 * @returns The header element.
 */
export function Header(): React.JSX.Element {
  const { user, isAuthenticated, signOut, initializing } = useAuth();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-canvas/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 text-content">
          <LinkGlyph />
          <span className="text-sm font-semibold tracking-tight">Shortener</span>
        </Link>

        {/* Primary navigation */}
        <nav aria-label="Primary" className="hidden items-center gap-1 sm:flex">
          {NAV_ITEMS.map((item) => {
            // Exact match for the root, prefix match elsewhere, so
            // /dashboard/links/123 still highlights "Dashboard".
            const isActive =
              item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                // Announces the current page to assistive technology.
                aria-current={isActive ? 'page' : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-surface-raised text-content'
                    : 'text-muted hover:text-content hover:bg-surface-raised/60'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Auth controls */}
        <div className="flex items-center gap-2">
          {initializing ? (
            // Placeholder of the same size, so the header does not shift when
            // the session finishes restoring.
            <div className="h-8 w-24 animate-pulse rounded-lg bg-surface-raised" />
          ) : isAuthenticated ? (
            <>
              <span className="hidden text-sm text-muted sm:inline" title={user?.email}>
                {user?.displayName || user?.email}
              </span>
              <Button variant="ghost" size="sm" onClick={signOut}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Sign in
                </Button>
              </Link>
              <Link href="/register">
                <Button variant="primary" size="sm">
                  Sign up
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/** Brand glyph — two interlocking chain links. */
function LinkGlyph(): React.JSX.Element {
  return (
    <svg
      className="h-7 w-7 rounded-lg bg-brand/15 p-1.5 text-brand-hover"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  );
}
