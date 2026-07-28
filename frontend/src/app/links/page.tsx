'use client';

/**
 * Public directory of every link in the database.
 *
 * Satisfies the task's "you should have a list of all URLs saved in the
 * database" requirement. Ownership is still enforced: rows the viewer does not
 * own show no edit or delete controls, and the API rejects those operations
 * regardless of what the UI renders.
 */

import { LinkList } from '../../components/links/LinkList';

/**
 * Renders the all-links page.
 *
 * @returns The page element.
 */
export default function LinksPage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-content">All links</h1>
        <p className="mt-1 text-sm text-muted">
          Every short link created with this shortener. Sign in to manage the ones you own.
        </p>
      </header>

      <LinkList
        title="All links"
        mineOnly={false}
        emptyMessage="Nothing has been shortened yet."
      />
    </div>
  );
}
