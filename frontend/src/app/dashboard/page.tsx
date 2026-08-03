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
import {
  ANALYTICS_PERIODS,
  DEFAULT_ANALYTICS_PERIOD_DAYS,
  SCOPE_OPTIONS,
  type LinkScope,
} from '../../lib/analytics-periods';
import { SegmentedToggle } from '../../components/ui/SegmentedToggle';

/**
 * Renders the dashboard.
 *
 * @returns The page element.
 */
export default function DashboardPage(): React.JSX.Element {
  const { isAuthenticated, initializing } = useAuth();
  const [days, setDays] = useState(DEFAULT_ANALYTICS_PERIOD_DAYS);
  // Defaults to 'mine': a signed-in user opening their dashboard is asking
  // about their own links. Anonymous callers never see the switch.
  const [scope, setScope] = useState<LinkScope>('mine');

  const showScope = isAuthenticated;
  const mineOnly = showScope && scope === 'mine';

  const fetchOverview = useCallback(() => getOverview(days, mineOnly), [days, mineOnly]);
  const { data, loading, error } = useAsyncData(fetchOverview, [
    days,
    mineOnly,
    isAuthenticated,
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      {/* ---- Page header with the period filter ----
          Filters sit in a single row above the charts, so changing the window
          visibly re-scopes everything below it. */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-content">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">
            {!isAuthenticated
              ? 'Public totals across every link. Sign in to see just your own.'
              : data?.scopedToUser
                ? 'How your links are performing.'
                : 'Public totals across every link.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showScope && (
            <SegmentedToggle
              options={SCOPE_OPTIONS}
              value={scope}
              onChange={setScope}
              ariaLabel="Scope the figures by owner"
            />
          )}

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
              title={mineOnly ? 'Your links' : 'All links'}
              mineOnly={mineOnly}
              emptyMessage={
                mineOnly
                  ? 'You haven’t created any links yet.'
                  : 'Nothing has been shortened yet.'
              }
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
