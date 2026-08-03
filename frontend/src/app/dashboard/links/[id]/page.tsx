'use client';

/**
 * Per-link analytics detail.
 *
 * Reached from any link row or from the dashboard's popularity table. Answers
 * "how is *this* link doing?" — the trend, the audience, and where the traffic
 * comes from.
 */

import { useCallback, useState } from 'react';
import { useParams } from 'next/navigation';
import NextLink from 'next/link';
import { Card, CardHeader } from '../../../../components/ui/Card';
import { Alert, Badge, Skeleton } from '../../../../components/ui/Feedback';
import { CopyButton } from '../../../../components/ui/CopyButton';
import { StatTile } from '../../../../components/charts/StatTile';
import { TrendChart } from '../../../../components/charts/TrendChart';
import {
  BreakdownBars,
  formatDeviceLabel,
} from '../../../../components/charts/BreakdownBars';
import { useAsyncData } from '../../../../hooks/useAsync';
import { getLinkAnalytics } from '../../../../lib/api/analytics';
import { formatDate, formatRelativeTime, stripProtocol } from '../../../../lib/format';
import { useToast } from '../../../../providers/ToastProvider';
import {
  ANALYTICS_PERIODS,
  DEFAULT_ANALYTICS_PERIOD_DAYS,
} from '../../../../lib/analytics-periods';

/**
 * Renders the analytics page for one link.
 *
 * @returns The page element.
 */
export default function LinkAnalyticsPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const linkId = params.id;
  const { showSuccess } = useToast();
  const [days, setDays] = useState(DEFAULT_ANALYTICS_PERIOD_DAYS);

  const fetchAnalytics = useCallback(
    () => getLinkAnalytics(linkId, days),
    [linkId, days],
  );
  const { data, loading, error } = useAsyncData(fetchAnalytics, [linkId, days]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <NextLink
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-content"
      >
        ← Back to dashboard
      </NextLink>

      {error ? (
        <Alert variant="error">{error}</Alert>
      ) : loading ? (
        <div className="space-y-6">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* ---- Link identity ---- */}
          <Card>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={data.link.shortUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-lg font-medium text-brand-hover hover:underline"
                  >
                    {stripProtocol(data.link.shortUrl)}
                  </a>
                  {data.link.isCustomSlug && <Badge tone="brand">custom</Badge>}
                  {!data.link.isActive && <Badge tone="danger">disabled</Badge>}
                </div>

                {data.link.title && (
                  <p className="mt-1.5 text-sm text-content">{data.link.title}</p>
                )}

                <a
                  href={data.link.targetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-anywhere mt-1 block text-sm text-subtle hover:text-muted"
                >
                  → {data.link.targetUrl}
                </a>

                <p className="mt-3 text-xs text-subtle">
                  Created {formatDate(data.link.createdAt)} · Last visit{' '}
                  {formatRelativeTime(data.link.lastVisitedAt)}
                  {data.link.expiresAt && ` · Expires ${formatDate(data.link.expiresAt)}`}
                </p>
              </div>

              <CopyButton
                value={data.link.shortUrl}
                onCopied={() => showSuccess('Copied to clipboard')}
              />
            </div>
          </Card>

          {/* ---- Period filter ---- */}
          <div className="flex justify-end">
            <div
              className="flex rounded-lg border border-border bg-surface p-1"
              role="group"
              aria-label="Select time period"
            >
              {ANALYTICS_PERIODS.map((option) => (
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
          </div>

          {/* ---- Headline figures ---- */}
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Total visits" value={data.link.visitCount} hint="all time" compact />
            <StatTile
              label="Visits"
              value={data.visitsInPeriod}
              hint={`last ${data.periodDays} days`}
              compact
            />
            <StatTile
              label="Unique visitors"
              value={data.uniqueVisitors}
              hint="all time"
              compact
            />
          </div>

          {/* ---- Trend ---- */}
          <Card>
            <CardHeader
              title="Visits over time"
              description={`Daily redirects across the last ${data.periodDays} days (UTC).`}
            />
            <TrendChart data={data.visitsOverTime} label="Visits per day for this link" />
          </Card>

          {/* ---- Breakdowns ---- */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title="Referrers" description="Where the clicks came from." />
              <BreakdownBars items={data.referrers} />
            </Card>

            <Card>
              <CardHeader title="Devices" description="What visitors are using." />
              <BreakdownBars items={data.devices} formatLabel={formatDeviceLabel} />
            </Card>

            <Card>
              <CardHeader title="Browsers" />
              <BreakdownBars items={data.browsers} />
            </Card>

            <Card>
              <CardHeader title="Operating systems" />
              <BreakdownBars items={data.operatingSystems} />
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
