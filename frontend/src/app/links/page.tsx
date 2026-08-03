'use client';

/**
 * Public directory of every link in the database.
 *
 * Satisfies the task's "you should have a list of all URLs saved in the
 * database" requirement. Signed-in users additionally get an "All links / My
 * links" switch, which covers "accounts so people can view the URLs they have
 * created" from the same page.
 *
 * Ownership is still enforced server-side: rows the viewer does not own show no
 * edit or delete controls, and the API rejects those operations regardless of
 * what the UI renders.
 */

import { LinkList } from '../../components/links/LinkList';
import { useAuth } from '../../providers/AuthProvider';

/**
 * Renders the all-links page.
 *
 * @returns The page element.
 */
export default function LinksPage(): React.JSX.Element {
  const { isAuthenticated } = useAuth();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-content">All links</h1>
        <p className="mt-1 text-sm text-muted">
          {isAuthenticated
            ? 'Every short link created with this shortener. Switch to “My links” to see only your own.'
            : 'Every short link created with this shortener. Sign in to manage the ones you own.'}
        </p>
      </header>

      <LinkList
        title="All links"
        // The toggle takes over the scope for signed-in users; anonymous
        // visitors keep the full public list.
        showScopeToggle
        emptyMessage="Nothing has been shortened yet."
      />
    </div>
  );
}
