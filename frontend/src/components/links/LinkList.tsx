'use client';

/**
 * Searchable, sortable, paginated link list.
 *
 * Serves two of the task's requirements from one component:
 *  • "a list of all URLs saved in the database" (`mineOnly = false`);
 *  • "accounts so people can view the URLs they have created" (`mineOnly = true`).
 *
 * Everything else — search, sorting, pagination, edit and delete — is shared,
 * so the two views can never drift apart.
 */

import { useCallback, useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Alert, EmptyState, Skeleton } from '../ui/Feedback';
import { LinkRow } from './LinkRow';
import { EditSlugModal } from './EditSlugModal';
import { useAsyncData } from '../../hooks/useAsync';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { deleteLink, listLinks } from '../../lib/api/links';
import { formatNumber, pluralize } from '../../lib/format';
import { useToast } from '../../providers/ToastProvider';
import { useAuth } from '../../providers/AuthProvider';
import type { Link } from '../../lib/types';
import { SCOPE_OPTIONS, type LinkScope } from '../../lib/analytics-periods';
import { LINK_SORT_OPTIONS, resolveLinkSort } from '../../lib/link-sort';
import { SegmentedToggle } from '../ui/SegmentedToggle';

export interface LinkListProps {
  /**
   * Restrict to the signed-in user's own links.
   *
   * Ignored when {@link LinkListProps.showScopeToggle} is set, since the toggle
   * then owns the scope.
   */
  mineOnly?: boolean;
  /**
   * Offer an "All links / My links" switch.
   *
   * Only rendered for signed-in users — an anonymous visitor has no "mine" to
   * show, and the API rejects `mineOnly` without a token anyway.
   */
  showScopeToggle?: boolean;
  /**
   * Which side the scope toggle starts on, for signed-in users.
   *
   * Differs by page rather than being a global default: `/links` exists to show
   * the whole database, while the home page is where you have just shortened
   * something and want to see your own. Ignored when
   * {@link LinkListProps.showScopeToggle} is not set.
   */
  defaultScope?: LinkScope;
  /** Heading above the list. */
  title?: string;
  /** Message shown when the list is empty. */
  emptyMessage?: string;
  /** Bumping this value forces a refetch — used after creating a link. */
  refreshToken?: number;
}

/** Rows requested per page. */
const PAGE_SIZE = 10;

/**
 * Renders a link list with its controls.
 *
 * @param props List scope and presentation options.
 * @returns The list element.
 */
export function LinkList({
  mineOnly = false,
  showScopeToggle = false,
  defaultScope = 'all',
  title = 'Links',
  emptyMessage = 'No links yet. Shorten one to get started.',
  refreshToken = 0,
}: LinkListProps): React.JSX.Element {
  const { showSuccess, showError } = useToast();
  const { isAuthenticated } = useAuth();

  const [search, setSearch] = useState('');
  const [sortValue, setSortValue] = useState('newest');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Link | null>(null);
  const [scope, setScope] = useState<LinkScope>(defaultScope);

  // The toggle is only offered to signed-in users, so it can only take control
  // of the scope for them. Everyone else keeps the caller's `mineOnly`.
  const toggleActive = showScopeToggle && isAuthenticated;
  const requestedMineOnly = toggleActive ? scope === 'mine' : mineOnly;

  // Clamped to the auth state, unconditionally. `GET /links?mineOnly=true`
  // without a token is a 403, and there is no arrangement of props or timing in
  // which asking for it is correct — so the component refuses to, rather than
  // trusting every caller to guard it.
  //
  // This closes a real gap: a caller passing `mineOnly={isAuthenticated}` looks
  // safe, but the value is captured while auth is still resolving, and a token
  // that the API later rejects (expired, or belonging to a user deleted by a
  // database reset) leaves the client believing it is signed in while the
  // server treats the request as anonymous.
  const effectiveMineOnly = requestedMineOnly && isAuthenticated;

  // Signing out returns the toggle to this page's default, so the next sign-in
  // starts where the page intends rather than inheriting the previous session's
  // choice.
  //
  // Resetting to `defaultScope` rather than a hard-coded 'all' matters: on a
  // page defaulting to "mine", an anonymous visitor starts at 'mine', and a
  // hard-coded reset would clear it before they ever sign in — quietly undoing
  // the default. Comparing against `defaultScope` also makes this a no-op in
  // that case instead of a repeated set.
  //
  // Note this is about the visible toggle only. Asking the API for a scope it
  // would reject is already impossible: `effectiveMineOnly` is ANDed with
  // `isAuthenticated` above.
  useEffect(() => {
    if (!isAuthenticated && scope !== defaultScope) {
      setScope(defaultScope);
      setPage(1);
    }
  }, [isAuthenticated, scope, defaultScope]);

  const debouncedSearch = useDebouncedValue(search, 350);
  const sort = resolveLinkSort(sortValue);

  const fetchLinks = useCallback(
    () =>
      listLinks({
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch || undefined,
        sortBy: sort.sortBy,
        sortOrder: sort.sortOrder,
        mineOnly: effectiveMineOnly,
      }),
    [page, debouncedSearch, sort.sortBy, sort.sortOrder, effectiveMineOnly],
  );

  const { data, loading, error, refetch } = useAsyncData(fetchLinks, [
    page,
    debouncedSearch,
    sortValue,
    effectiveMineOnly,
    refreshToken,
  ]);

  /**
   * Deletes a link after confirming with the user.
   *
   * @param link The link to delete.
   */
  const handleDelete = async (link: Link): Promise<void> => {
    // Deletion also destroys the link's analytics and breaks any shared copy of
    // the short URL, so it warrants an explicit confirmation.
    const confirmed = window.confirm(
      `Delete ${link.shortUrl}?\n\nThis cannot be undone, and anyone using the short link will get a 404.`,
    );
    if (!confirmed) return;

    try {
      await deleteLink(link.id);
      showSuccess('Link deleted');
      refetch();
    } catch {
      showError('Could not delete the link. Please try again.');
    }
  };

  /** Applies a saved slug change without a full refetch. */
  const handleSaved = (): void => {
    showSuccess('Slug updated');
    refetch();
  };

  /** Resets to page 1 whenever the filters change, so results are never skipped. */
  const handleFilterChange = (apply: () => void): void => {
    apply();
    setPage(1);
  };

  const links = data?.data ?? [];
  const meta = data?.meta;

  // When the toggle owns the scope, the heading and empty state must follow it —
  // otherwise "All links / 0 links" would show while viewing an empty "My links".
  const heading = toggleActive
    ? (SCOPE_OPTIONS.find((option) => option.value === scope)?.label ?? title)
    : title;
  const emptyText =
    toggleActive && scope === 'mine'
      ? 'You haven’t created any links yet. Shorten one and it will appear here.'
      : emptyMessage;

  return (
    <>
      <Card flush>
        {/* ---- Header and controls ---- */}
        <div className="flex flex-col gap-3 border-b border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-content">{heading}</h2>
            {meta && (
              <p className="mt-0.5 text-xs text-subtle">
                {formatNumber(meta.total)} {pluralize(meta.total, 'link')}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/*
              Scope switch. Rendered only for signed-in users: an anonymous
              visitor has no "mine", and the API returns 403 for `mineOnly`
              without a token — so offering it would be a dead control.
            */}
            {toggleActive && (
              <SegmentedToggle
                options={SCOPE_OPTIONS}
                value={scope}
                onChange={(next) => handleFilterChange(() => setScope(next))}
                ariaLabel="Filter links by owner"
              />
            )}

            <div className="w-full sm:w-56">
              <Input
                type="search"
                placeholder="Search links…"
                value={search}
                onChange={(event) => handleFilterChange(() => setSearch(event.target.value))}
                aria-label="Search links"
              />
            </div>

            <select
              value={sortValue}
              onChange={(event) => handleFilterChange(() => setSortValue(event.target.value))}
              aria-label="Sort links"
              className="h-[42px] shrink-0 rounded-lg border border-border bg-surface px-3 text-sm text-content transition-colors hover:border-border-strong focus:border-brand focus:outline-none"
            >
              {LINK_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ---- Body: one of loading / error / empty / rows ---- */}
        {loading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-14 w-full" rows={4} />
          </div>
        ) : error ? (
          <div className="p-4">
            <Alert variant="error">{error}</Alert>
          </div>
        ) : links.length === 0 ? (
          <EmptyState
            icon="🔗"
            title={debouncedSearch ? 'No matching links' : 'No links yet'}
            description={debouncedSearch ? 'Try a different search term.' : emptyText}
          />
        ) : (
          <ul>
            {links.map((link) => (
              <LinkRow
                key={link.id}
                link={link}
                onEdit={setEditing}
                onDelete={handleDelete}
              />
            ))}
          </ul>
        )}

        {/* ---- Pagination ---- */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border/70 px-4 py-3">
            <p className="text-xs text-subtle">
              Page {meta.page} of {meta.totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={!meta.hasPrevious}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!meta.hasNext}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <EditSlugModal
        link={editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSaved={handleSaved}
      />
    </>
  );
}
