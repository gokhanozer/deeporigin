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

import { useCallback, useState } from 'react';
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
import type { Link, LinkSortField } from '../../lib/types';

export interface LinkListProps {
  /** Restrict to the signed-in user's own links. */
  mineOnly?: boolean;
  /** Heading above the list. */
  title?: string;
  /** Message shown when the list is empty. */
  emptyMessage?: string;
  /** Bumping this value forces a refetch — used after creating a link. */
  refreshToken?: number;
}

/** Sort options offered in the UI, mapped to API parameters. */
const SORT_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
  sortBy: LinkSortField;
  sortOrder: 'asc' | 'desc';
}> = [
  { value: 'newest', label: 'Newest first', sortBy: 'createdAt', sortOrder: 'desc' },
  { value: 'oldest', label: 'Oldest first', sortBy: 'createdAt', sortOrder: 'asc' },
  { value: 'popular', label: 'Most visited', sortBy: 'visitCount', sortOrder: 'desc' },
  { value: 'recent', label: 'Recently visited', sortBy: 'lastVisitedAt', sortOrder: 'desc' },
];

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
  title = 'Links',
  emptyMessage = 'No links yet. Shorten one to get started.',
  refreshToken = 0,
}: LinkListProps): React.JSX.Element {
  const { showSuccess, showError } = useToast();

  const [search, setSearch] = useState('');
  const [sortValue, setSortValue] = useState('newest');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Link | null>(null);

  const debouncedSearch = useDebouncedValue(search, 350);
  const sort = SORT_OPTIONS.find((option) => option.value === sortValue) ?? SORT_OPTIONS[0];

  const fetchLinks = useCallback(
    () =>
      listLinks({
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch || undefined,
        sortBy: sort.sortBy,
        sortOrder: sort.sortOrder,
        mineOnly,
      }),
    [page, debouncedSearch, sort.sortBy, sort.sortOrder, mineOnly],
  );

  const { data, loading, error, refetch } = useAsyncData(fetchLinks, [
    page,
    debouncedSearch,
    sortValue,
    mineOnly,
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

  return (
    <>
      <Card flush>
        {/* ---- Header and controls ---- */}
        <div className="flex flex-col gap-3 border-b border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-content">{title}</h2>
            {meta && (
              <p className="mt-0.5 text-xs text-subtle">
                {formatNumber(meta.total)} {pluralize(meta.total, 'link')}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
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
              {SORT_OPTIONS.map((option) => (
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
            description={debouncedSearch ? 'Try a different search term.' : emptyMessage}
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
