'use client';

/**
 * "Most popular links" table.
 *
 * A table, not a bar chart: each row carries several attributes (slug,
 * destination, visit count, last visit) and the reader wants to *look one up*
 * as much as compare magnitudes. The inline proportion bar behind each count
 * supplies the visual comparison a chart would have provided, without giving up
 * the detail.
 */

import NextLink from 'next/link';
import { CopyButton } from '../ui/CopyButton';
import { Badge, EmptyState } from '../ui/Feedback';
import { formatNumber, formatRelativeTime, stripProtocol, truncateMiddle } from '../../lib/format';
import { useToast } from '../../providers/ToastProvider';
import { isExpired, ownerLabel } from '../../lib/link-state';
import type { Link } from '../../lib/types';

export interface TopLinksTableProps {
  /** Links ranked by visit count, highest first. */
  links: Link[];
  /**
   * Called when a row is chosen, instead of navigating to its analytics page.
   *
   * Supplied by the dashboard so the charts above can re-render for the chosen
   * link without leaving the page — comparing two links otherwise means a
   * round trip through the browser's Back button each time.
   *
   * Omit it and each slug is a normal link to its own page.
   */
  onSelect?: (link: Link) => void;
  /** Row to mark as currently shown in the charts. */
  selectedId?: string | null;
}

/**
 * Renders the ranked link table.
 *
 * @param props The ranked links.
 * @returns The table element.
 */
export function TopLinksTable({
  links,
  onSelect,
  selectedId,
}: TopLinksTableProps): React.JSX.Element {
  const { showSuccess } = useToast();

  if (links.length === 0) {
    return (
      <EmptyState
        icon="📊"
        title="No links to rank yet"
        description="Once your links start receiving visits, the most popular will appear here."
      />
    );
  }

  // Scaled against the leader, so the bars use the full width of the column.
  const maxVisits = Math.max(...links.map((link) => link.visitCount), 1);


  return (
    // Wide tables scroll inside their own container rather than forcing the
    // whole page to scroll horizontally on a phone.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] text-sm">
        <thead>
          <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wide text-subtle">
            <th scope="col" className="px-4 py-2.5 font-medium">
              Short link
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Owner
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Destination
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Visits
            </th>
            <th scope="col" className="hidden px-4 py-2.5 text-right font-medium md:table-cell">
              Last visit
            </th>
            <th scope="col" className="px-4 py-2.5">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>

        <tbody>
          {links.map((link) => (
            <tr
              key={link.id}
              aria-current={link.id === selectedId ? 'true' : undefined}
              className={`border-b border-border/40 transition-colors last:border-b-0 hover:bg-surface-raised/40 ${
                link.id === selectedId ? 'bg-surface-raised/60' : ''
              }`}
            >
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  {/* The slug drills into that link's metrics — for your own
                      links and anonymous ones. Another user's link stays listed
                      (the brief asks for every URL in the database) but is not
                      clickable, because its metrics are private. The Owner
                      column says which case a row is in. */}
                  {link.canViewAnalytics && onSelect ? (
                    <button
                      type="button"
                      onClick={() => onSelect(link)}
                      className="font-mono text-brand-hover hover:underline"
                      title={`Show metrics for /${link.slug}`}
                    >
                      /{link.slug}
                    </button>
                  ) : link.canViewAnalytics ? (
                    <NextLink
                      href={`/dashboard/links/${link.id}`}
                      className="font-mono text-brand-hover hover:underline"
                      title={`View metrics for /${link.slug}`}
                    >
                      /{link.slug}
                    </NextLink>
                  ) : (
                    <span
                      className="font-mono text-muted"
                      title="Metrics for this link are private to its owner"
                    >
                      /{link.slug}
                    </span>
                  )}

                  {/* Without these, a disabled or expired link sits at the top
                      of "most popular" looking perfectly healthy. */}
                  {link.isCustomSlug && <Badge tone="brand">custom</Badge>}
                  {!link.isActive && <Badge tone="danger">disabled</Badge>}
                  {isExpired(link) && <Badge tone="warning">expired</Badge>}
                </div>
                {link.title && <p className="mt-0.5 truncate text-xs text-subtle">{link.title}</p>}
              </td>

              <td className="whitespace-nowrap px-4 py-3 text-muted">
                {ownerLabel(link)}
              </td>

              <td className="max-w-[18rem] px-4 py-3">
                <a
                  href={link.targetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-muted hover:text-content"
                  title={link.targetUrl}
                >
                  {truncateMiddle(stripProtocol(link.targetUrl), 48)}
                </a>
              </td>

              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2">
                  {/* Proportion bar: the comparison a chart would give, inline. */}
                  <div
                    className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface-raised sm:block"
                    aria-hidden="true"
                  >
                    <div
                      className="h-full rounded-r-full bg-[var(--color-series-1)]"
                      style={{ width: `${Math.max((link.visitCount / maxVisits) * 100, 2)}%` }}
                    />
                  </div>
                  <span className="tabular-nums font-medium text-content">
                    {formatNumber(link.visitCount)}
                  </span>
                </div>
              </td>

              <td className="hidden px-4 py-3 text-right text-xs text-subtle md:table-cell">
                {formatRelativeTime(link.lastVisitedAt)}
              </td>

              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  {/* Owners reach metrics by clicking the slug, so the only
                      action left here is the one every row needs. */}
                  <CopyButton
                    value={link.shortUrl}
                    size="sm"
                    label=""
                    onCopied={() => showSuccess('Copied to clipboard')}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
