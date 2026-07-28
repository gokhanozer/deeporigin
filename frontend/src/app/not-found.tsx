/**
 * 404 page.
 *
 * Rendered when `notFound()` is called by the slug resolver — which is the
 * task's "if an invalid slug is accessed, display a 404 Not Found page"
 * requirement — and for any other unmatched route.
 *
 * Deliberately does not distinguish "never existed" from "expired" or
 * "disabled": to a visitor the outcome is identical, and spelling out which
 * slugs once existed would leak information about other people's links.
 */

import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Link not found',
};

/**
 * Renders the not-found page.
 *
 * @returns The page element.
 */
export default function NotFound(): React.JSX.Element {
  return (
    <div className="hero-glow flex min-h-[70vh] items-center justify-center px-4">
      <div className="text-center">
        <p className="font-mono text-6xl font-semibold text-brand-hover sm:text-7xl">404</p>

        <h1 className="mt-4 text-xl font-semibold tracking-tight text-content sm:text-2xl">
          This short link doesn&rsquo;t exist
        </h1>

        <p className="mx-auto mt-3 max-w-md text-sm text-muted">
          The link may have been mistyped, deleted, or it may have expired. Check
          the URL, or create a new short link of your own.
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-lg bg-brand px-5 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
          >
            Shorten a URL
          </Link>
          <Link
            href="/links"
            className="inline-flex h-10 items-center rounded-lg border border-border bg-surface-raised px-5 text-sm font-medium text-content transition-colors hover:border-border-strong"
          >
            Browse all links
          </Link>
        </div>
      </div>
    </div>
  );
}
