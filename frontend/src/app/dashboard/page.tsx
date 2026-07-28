'use client';

/**
 * Popularity dashboard.
 *
 * Implements "add a dashboard showing how popular your URLs are". Layout runs
 * from the most summarised information to the most detailed — stat tiles, then
 * the trend, then breakdowns, then the full list — so the headline answer is
 * readable in a glance and the supporting detail is there when wanted.
 */

import { useCallback, useState } from 'react';
import { Card, CardHeader } from '../../components/ui/Card';
import { Alert, Skeleton } from '../../components/ui/Feedback';
import { StatTile } from '../../components/charts/StatTile';
import { TrendChart } from '../../components/charts/TrendChart';
import { BreakdownBars, formatDeviceLabel } from '../../components/charts/BreakdownBars';
import { LinkList } from '../../components/links/LinkList';
import { TopLinksTable } from '../../components/links/TopLinksTable';
import { useAsyncData } from '../../hooks/useAsync';
import { getOverview } from '../../lib/api/analytics';
import { useAuth } from '../../providers/AuthProvider';

/** Selectable look-back windows. */
const PERIOD_OPTIONS: ReadonlyArray<{ days: number; label: string }> = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

/**
 * Renders the dashboard.
 *
 * @returns The page element.
 */
export default function DashboardPage(): React.JSX.Element {
  const { isAuthenticated, initializing } = useAuth();
  const [days, setDays] = useState(30);

  const fetchOverview = useCallback(() => getOverview(days), [days]);
  const { data, loading, error } = useAsyncData(fetchOverview, [days, isAuthenticated]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      {/* ---- Page header with the period filter ----
          Filters sit in a single row above the charts, so changing the window
          visibly re-scopes everything below it. */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-content">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">
            {data?.scopedToUser
              ? 'How your links are performing.'
              : 'Public totals across every link. Sign in to see just your own.'}
          </p>
        </div>

        <div
          className="flex rounded-lg border border-border bg-surface p-1"
          role="group"
          aria-label="Select time period"
        >
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.days}
              type="button"
              onClick={() => setDays(option.days)}
              aria-pressed={days === option.days}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                days === option.days
                  ? 'bg-surface-raised text-content'
                  : 'text-muted hover:text-content'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <Alert variant="error" className="mb-6">
          {error}
        </Alert>
      )}

      {loading || initializing ? (
        <DashboardSkeleton />
      ) : data ? (
        <div className="space-y-6">
          {/* ---- Headline figures ---- */}
          <section aria-label="Summary statistics">
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
          </section>

          {/* ---- Trend ---- */}
          <Card>
            <CardHeader
              title="Visits over time"
              description={`Daily redirects across the last ${data.periodDays} days (UTC).`}
            />
            <TrendChart data={data.visitsOverTime} label="Visits per day" />
          </Card>

          {/* ---- Breakdowns ---- */}
          <section className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader title="Top referrers" description="Where the clicks came from." />
              <BreakdownBars items={data.referrers} emptyMessage="No referrer data yet." />
            </Card>

            <Card>
              <CardHeader title="Devices" description="What visitors are using." />
              <BreakdownBars
                items={data.devices}
                formatLabel={formatDeviceLabel}
                emptyMessage="No device data yet."
              />
            </Card>

            <Card>
              <CardHeader title="Browsers" description="Which browsers visitors arrive in." />
              <BreakdownBars items={data.browsers} emptyMessage="No browser data yet." />
            </Card>
          </section>

          {/* ---- Most popular links ---- */}
          <Card flush>
            <div className="border-b border-border/70 p-4">
              <h2 className="text-sm font-semibold text-content">Most popular links</h2>
              <p className="mt-0.5 text-sm text-subtle">Ranked by all-time visits.</p>
            </div>
            <TopLinksTable links={data.topLinks} />
          </Card>

          {/* ---- Full list ---- */}
          {isAuthenticated && (
            <LinkList
              title="Your links"
              mineOnly
              emptyMessage="You haven’t created any links yet."
            />
          )}
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
