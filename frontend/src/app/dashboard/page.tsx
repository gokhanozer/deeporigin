'use client';

/**
 * Popularity dashboard.
 *
 * Implements "add a dashboard showing how popular your URLs are". Layout runs
 * from the most summarised information to the most detailed — stat tiles, then
 * the trend, then breakdowns, then the full list — so the headline answer is
 * readable in a glance and the supporting detail is there when wanted.
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardHeader } from '../../components/ui/Card';
import { Alert, Skeleton } from '../../components/ui/Feedback';
import { StatTile } from '../../components/charts/StatTile';
import { TrendChart } from '../../components/charts/TrendChart';
import { BreakdownBars, formatDeviceLabel } from '../../components/charts/BreakdownBars';
import { TopLinksTable } from '../../components/links/TopLinksTable';
import { useAsyncData } from '../../hooks/useAsync';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { usePreservedScroll } from '../../hooks/usePreservedScroll';
import { getLinkAnalytics, getOverview } from '../../lib/api/analytics';
import { listLinks } from '../../lib/api/links';
import { useAuth } from '../../providers/AuthProvider';
import {
  ANALYTICS_PERIODS,
  DEFAULT_ANALYTICS_PERIOD_DAYS,
  LINK_TABLE_VIEWS,
  type LinkTableView,
} from '../../lib/analytics-periods';
import { LINK_SORT_OPTIONS, resolveLinkSort } from '../../lib/link-sort';
import { SegmentedToggle } from '../../components/ui/SegmentedToggle';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import type { Link } from '../../lib/types';

/** The two views that list links, as opposed to ranking them. */
type ListView = Exclude<LinkTableView, 'popular'>;

/**
 * What each view is called, wherever it is named.
 *
 * Shared by the banner and the table heading so the two cannot describe the
 * same state differently.
 */
const VIEW_LABELS: Record<LinkTableView, string> = {
  popular: 'Most popular links',
  all: 'All links',
  mine: 'Your links',
};

/**
 * Rows per page in the All links and Your links views.
 *
 * Most popular is not paged — its length is fixed by the API's top-N query.
 * Editing and deleting still live on `/links`; this table is for reading.
 */
const TABLE_PAGE_SIZE = 10;

/**
 * Renders the dashboard.
 *
 * @returns The page element.
 */
export default function DashboardPage(): React.JSX.Element {
  const { isAuthenticated, initializing } = useAuth();
  const [days, setDays] = useState(DEFAULT_ANALYTICS_PERIOD_DAYS);
  // The link whose metrics the charts are showing. `null` means "everything in
  // scope", which is how the page starts.
  const [selected, setSelected] = useState<Link | null>(null);

  // ---- The link table ----------------------------------------------------
  // "Most popular" is a fixed top-N ranking from the analytics query; the other
  // two are ordinary list queries that take a sort and a search.
  const [tableView, setTableView] = useState<LinkTableView>('popular');

  // Ordering per list view, remembered while the page is open. Kept separately
  // because the two answer different questions — you might rank everyone's
  // links by visits while keeping your own newest-first — and a shared value
  // silently reordered one view when you sorted the other.
  //
  // Most popular has no ordering to remember: it is a by-visits ranking by
  // definition, so it is displayed but never stored.
  const [listSorts, setListSorts] = useState<Record<ListView, string>>({
    all: 'newest',
    mine: 'newest',
  });

  // Signing out while viewing "Your links" would leave a query the API rejects.
  const effectiveView: LinkTableView =
    tableView === 'mine' && !isAuthenticated ? 'all' : tableView;

  const isRanking = effectiveView === 'popular';
  const mineOnly = effectiveView === 'mine';

  // The dropdown names the ordering in effect: the ranking is by visits, each
  // list view uses whatever was last chosen for it. Derived rather than
  // assigned, so visiting Most popular does not overwrite either choice.
  const listView: ListView = mineOnly ? 'mine' : 'all';
  const activeSort = listSorts[listView];
  const displaySort = isRanking ? 'popular' : activeSort;
  const sort = resolveLinkSort(activeSort);

  const tableViews = isAuthenticated
    ? LINK_TABLE_VIEWS
    : LINK_TABLE_VIEWS.filter((view) => view.value !== 'mine');

  const fetchOverview = useCallback(() => getOverview(days, mineOnly), [days, mineOnly]);
  const { data, loading, error } = useAsyncData(fetchOverview, [
    days,
    mineOnly,
    isAuthenticated,
  ]);

  // Loaded alongside the overview rather than instead of it: the ranked table
  // has to stay on screen so the next link is one click away, and only the
  // overview supplies it.
  const fetchDetail = useCallback(
    () => (selected ? getLinkAnalytics(selected.id, days) : Promise.resolve(null)),
    [selected, days],
  );
  const { data: detail, loading: detailLoading, error: detailError } = useAsyncData(fetchDetail, [
    selected?.id,
    days,
  ]);

  // Charts read from whichever source is active. The two payloads share these
  // four fields exactly, which is what makes the swap a one-liner.
  const charts = detail ?? data;

  // Search and paging apply to the list views only. "Most popular" is a fixed
  // top-ten ranking, so filtering or paging it would make it something else.
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 350);

  // A filter change can leave you past the end of a shorter result set.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, effectiveView, activeSort]);

  const fetchTableLinks = useCallback(
    () =>
      isRanking
        ? Promise.resolve(null)
        : listLinks({
            page,
            pageSize: TABLE_PAGE_SIZE,
            search: debouncedSearch || undefined,
            sortBy: sort.sortBy,
            sortOrder: sort.sortOrder,
            mineOnly,
          }),
    [isRanking, page, debouncedSearch, sort.sortBy, sort.sortOrder, mineOnly],
  );
  const { data: listed, loading: listedLoading } = useAsyncData(fetchTableLinks, [
    effectiveView,
    page,
    debouncedSearch,
    activeSort,
    mineOnly,
    isAuthenticated,
  ]);

  const listMeta = listed?.meta ?? null;

  // The ranking's rows arrive with the overview; the list views' arrive
  // separately. Either way the table renders from one array, so switching view
  // never unmounts it.
  const tableBusy = isRanking ? loading : listedLoading;

  // Rows are held until the next set has actually arrived, rather than swapped
  // the moment the view changes.
  //
  // Switching away from the ranking leaves the list query's data at `null` — it
  // resolves to null while the ranking is showing — so the table would render
  // empty for a frame. That collapses the document, and the browser clamps the
  // scroll offset to the shorter page *before* anything can restore it:
  // restoring to 900px on a 600px document silently does nothing. Keeping the
  // previous rows holds the height steady so there is a position to return to.
  const [tableRows, setTableRows] = useState<Link[]>([]);

  useEffect(() => {
    // Gated on the data itself, never on the loading flag: `useAsyncData` sets
    // that inside an effect, so it still reads `false` on the render right
    // after a view switch. Trusting it let the rows fall to `[]` for a frame,
    // which is precisely the collapse this is meant to prevent.
    const next = isRanking ? data?.topLinks : listed?.data;
    if (next) setTableRows(next);
  }, [isRanking, data, listed]);

  // Switching view adds or removes the ranking note and the pagination bar,
  // both of which sit above the fold — Safari does not implement CSS scroll
  // anchoring, so without this the page snaps to the top there while staying
  // put in Chrome.
  const { preserve, release } = usePreservedScroll(
    [effectiveView, page, tableRows],
    !tableBusy,
  );

  /**
   * Changes which links the table lists, without moving the page.
   *
   * @param view The view chosen from the toggle.
   */
  const handleViewChange = (view: LinkTableView): void => {
    preserve();
    setTableView(view);
  };

  /**
   * Selects a link and brings the charts back into view.
   *
   * The table sits below the charts it drives, so picking a row from halfway
   * down the page would otherwise update only what is off-screen — the click
   * would appear to do nothing. Switching view is deliberately left alone:
   * there the table itself is what changed, and moving the page would lose the
   * reader's place.
   *
   * @param link The link whose metrics to show.
   */
  const handleSelectLink = (link: Link): void => {
    // Cancels any pending restore, so it cannot undo the scroll below.
    release();
    setSelected(link);
    // Honour a reduced-motion preference; a long smooth scroll is exactly the
    // kind of movement that setting exists to suppress.
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };



  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      {/* ---- Page header with the period filter ----
          Filters sit in a single row above the charts, so changing the window
          visibly re-scopes everything below it. */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-content">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">
            {mineOnly
              ? 'How your links are performing.'
              : selected
                ? `Figures for /${selected.slug}.`
                : 'Totals across every link.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SegmentedToggle
            options={ANALYTICS_PERIODS.map((option) => ({
              value: option.days,
              label: option.label,
            }))}
            value={days}
            onChange={setDays}
            ariaLabel="Select time period"
          />
        </div>
      </header>

      {error && (
        <Alert variant="error" className="mb-6">
          {error}
        </Alert>
      )}

      {detailError && (
        <Alert variant="error" className="mb-6">
          {detailError}
        </Alert>
      )}

      {/* Names what the figures below are describing, and gives the way back.
          Without it, a filtered dashboard looks identical to an unfiltered one
          with less traffic. */}
      {/* Always present, naming whatever the charts below describe.
          
          It names the *charts'* scope, not the table's, and those differ:
          Most popular and All links fetch the same overview, so the figures
          cover every link in both — only the table changes. Naming the view
          here would claim the metrics belonged to the ten ranked links. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-surface-raised/40 px-4 py-3">
        <p className="text-sm text-muted">
          {selected ? (
            <>
              Showing metrics for{' '}
              <span className="font-mono font-medium text-content">/{selected.slug}</span>
            </>
          ) : (
            <>
              Showing combined metrics for{' '}
              <span className="font-medium text-content">
                {mineOnly ? 'your links' : 'all links'}
              </span>
              {/* The drill-down is otherwise invisible: nothing about the table
                  suggests a row is clickable until you try one. */}
              <span className="block text-subtle sm:mt-0.5">
                Select a short link from the table to see its own metrics.
              </span>
            </>
          )}
          {(selected ? detailLoading : loading) && (
            <span className="ml-2 text-subtle">updating…</span>
          )}
        </p>

        {selected && (
          // `secondary`, not `ghost`: ghost is `text-muted` with a raised-surface
          // hover, and this banner already has a raised surface — so the control
          // had neither a border nor a colour setting it apart from the sentence
          // beside it. A border and its own background read as clickable without
          // relying on the reader hovering to find out.
          <Button variant="secondary" size="sm" onClick={() => setSelected(null)}>
            {/* Describes what it restores. "Show all links" collided with the
                view of that name, and "Back to Most popular links" would have
                implied the charts were ever scoped to those ten. */}
            ← Back to combined metrics
          </Button>
        )}
      </div>

      {(loading && !data) || initializing ? (
        <DashboardSkeleton />
      ) : data && charts ? (
        <div className="space-y-6">
          {/* ---- Headline figures ----
              Swap to the chosen link's own numbers, so the tiles never
              describe a different subject from the charts below them. */}
          <section aria-label="Summary statistics">
            {detail ? (
              <div className="grid grid-cols-3 gap-3">
                <StatTile
                  label="Total visits"
                  value={detail.link.visitCount}
                  hint="all time"
                  compact
                />
                <StatTile
                  label="Visits"
                  value={detail.visitsInPeriod}
                  hint={`last ${detail.periodDays} days`}
                  compact
                />
                <StatTile
                  label="Unique visitors"
                  value={detail.uniqueVisitors}
                  hint="all time"
                  compact
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <StatTile label="Links" value={data.totals.totalLinks} hint="total created" />
                <StatTile label="Total visits" value={data.totals.totalVisits} hint="all time" compact />
                <StatTile
                  label="Visits"
                  value={data.totals.visitsInPeriod}
                  hint={`last ${data.periodDays} days`}
                  compact
                />
                <StatTile
                  label="Unique visitors"
                  value={data.totals.uniqueVisitors}
                  hint={`last ${data.periodDays} days`}
                  compact
                />
                <StatTile
                  label="Avg per link"
                  value={data.totals.averageVisitsPerLink}
                  hint="visits per link"
                />
              </div>
            )}
          </section>

          {/* ---- Trend ---- */}
          <Card>
            <CardHeader
              title={detail ? `Visits over time — /${detail.link.slug}` : 'Visits over time'}
              description={`Daily redirects across the last ${charts.periodDays} days (UTC).`}
            />
            <TrendChart data={charts.visitsOverTime} label="Visits per day" />
          </Card>

          {/* ---- Breakdowns ---- */}
          <section className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader title="Top referrers" description="Where the clicks came from." />
              <BreakdownBars items={charts.referrers} emptyMessage="No referrer data yet." />
            </Card>

            <Card>
              <CardHeader title="Devices" description="What visitors are using." />
              <BreakdownBars
                items={charts.devices}
                formatLabel={formatDeviceLabel}
                emptyMessage="No device data yet."
              />
            </Card>

            <Card>
              <CardHeader title="Browsers" description="Which browsers visitors arrive in." />
              <BreakdownBars items={charts.browsers} emptyMessage="No browser data yet." />
            </Card>
          </section>

          {/* ---- Links ----
              One table with a switch, not three stacked ones. All three views
              show the same columns and support the same drill-down, so
              stacking them made the page long and left the reader comparing
              rows across a scroll. */}
          <Card flush>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 p-4">
              {/* `min-w-0` lets the description wrap inside its own column.
                  Without it the column sizes to its longest line, and a longer
                  description pushes the controls onto a second row — so the
                  header's layout changed depending on which view was selected. */}
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-content">
                  {VIEW_LABELS[effectiveView]}
                </h2>
                <p className="mt-0.5 text-sm text-subtle">
                  {/* Each says whether the charts above share this scope.
                      Only "Your links" narrows them; the other two are a
                      re-ordering of the same set, which is easy to misread when
                      one is called "Most popular". */}
                  {isRanking
                    ? 'Ten most visited. Charts above cover every link.'
                    : mineOnly
                      ? 'Links you created. Charts above cover them too.'
                      : 'Every link. Charts above cover the same set.'}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {/* Search and sort stay mounted but inert on the ranking, so the
                    header does not reflow when the view changes and the controls
                    stay visibly available on the other two. */}
                <div className="w-full sm:w-44 lg:w-56">
                  <Input
                    type="search"
                    placeholder="Search links…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    aria-label="Search links"
                    disabled={isRanking}
                  />
                </div>

                <select
                  value={displaySort}
                  onChange={(event) =>
                    setListSorts((current) => ({ ...current, [listView]: event.target.value }))
                  }
                  aria-label="Sort links"
                  disabled={isRanking}
                  title={
                    isRanking
                      ? 'Most popular is already ranked by visits — switch to All links or Your links to sort'
                      : undefined
                  }
                  className={`h-[42px] shrink-0 rounded-lg border px-3 text-sm transition-colors focus:border-brand focus:outline-none ${
                    isRanking
                      ? // Matches the disabled Input: dashed edge, flatter
                        // surface, dimmed text. Opacity alone reads as "loading".
                        'cursor-not-allowed border-dashed border-border/60 bg-surface-raised/30 text-subtle'
                      : 'border-border bg-surface text-content hover:border-border-strong'
                  }`}
                >
                  {LINK_SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <SegmentedToggle
                  options={tableViews}
                  value={effectiveView}
                  onChange={handleViewChange}
                  ariaLabel="Choose which links to list"
                />
              </div>
            </div>

            {/* Says why the controls above are inert. A tooltip alone only
                helps someone who already suspected they were. */}
            {isRanking && (
              <p className="border-b border-border/70 bg-surface-raised/20 px-4 py-2 text-xs text-subtle">
                Search and sorting are off for this view — it is a fixed ranking of the
                ten most visited links. Switch to{' '}
                <span className="font-medium text-muted">All links</span>
                {isAuthenticated && (
                  <>
                    {' '}or <span className="font-medium text-muted">Your links</span>
                  </>
                )}{' '}
                to search and sort.
              </p>
            )}

            {/* One table for every view, dimmed while its rows are being
                replaced. Swapping in a skeleton collapsed the card, and a page
                that suddenly gets shorter throws away wherever the reader had
                scrolled to. */}
            <div
              className={`transition-opacity ${tableBusy ? 'opacity-50' : 'opacity-100'}`}
              aria-busy={tableBusy}
            >
              <TopLinksTable
                links={tableRows}
                onSelect={handleSelectLink}
                selectedId={selected?.id ?? null}
              />
            </div>

            {!isRanking && listMeta && listMeta.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border/70 px-4 py-3">
                <p className="text-xs text-subtle">
                  Page {listMeta.page} of {listMeta.totalPages} · {listMeta.total} links
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!listMeta.hasPrevious}
                    onClick={() => {
                      preserve();
                      setPage((current) => current - 1);
                    }}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!listMeta.hasNext}
                    onClick={() => {
                      preserve();
                      setPage((current) => current + 1);
                    }}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Placeholder shown while the dashboard loads.
 *
 * Mirrors the real layout so the page does not reflow when data arrives.
 *
 * @returns The skeleton element.
 */
function DashboardSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-56 w-full" />
        ))}
      </div>
    </div>
  );
}
