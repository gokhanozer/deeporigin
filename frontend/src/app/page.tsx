'use client';

/**
 * Landing page — the shortening form from the task's mock-up.
 *
 * Deliberately usable without an account: the form is the first thing on the
 * page, and signing in only adds ownership and analytics on top. Requiring
 * registration before the core action would be a worse product.
 */

import { useState } from 'react';
import Link from 'next/link';
import { ShortenForm } from '../components/links/ShortenForm';
import { LinkList } from '../components/links/LinkList';
import { Card } from '../components/ui/Card';
import { useAuth } from '../providers/AuthProvider';

/**
 * Renders the home page.
 *
 * @returns The page element.
 */
export default function HomePage(): React.JSX.Element {
  const { isAuthenticated } = useAuth();
  // Incremented on each creation so the list below refetches.
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <div className="hero-glow">
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
        {/* ---- Hero ---- */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-content sm:text-4xl">
            Shorten any URL in seconds
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm text-muted sm:text-base">
            Paste a long link, get a short one you can share anywhere — then watch
            how it performs.
          </p>
        </div>

        {/* ---- The form ---- */}
        <Card className="shadow-xl shadow-black/20">
          <ShortenForm onCreated={() => setRefreshToken((token) => token + 1)} />
        </Card>

        {!isAuthenticated && (
          <p className="mt-4 text-center text-sm text-subtle">
            <Link href="/register" className="text-brand-hover hover:underline">
              Create a free account
            </Link>{' '}
            to keep track of your links and see their analytics.
          </p>
        )}

        {/* ---- Recent links ----
            Shows the shortener actually working, and doubles as the public
            "list of all URLs saved in the database". */}
        <section className="mt-12">
          <LinkList
            title={isAuthenticated ? 'Your recent links' : 'Recently shortened'}
            mineOnly={isAuthenticated}
            refreshToken={refreshToken}
            emptyMessage="Shorten your first URL using the form above."
          />
        </section>
      </div>
    </div>
  );
}
