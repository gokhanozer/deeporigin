'use client';

/**
 * Horizontal bar breakdown (referrers, devices, browsers, operating systems).
 *
 * Design decisions, and why:
 *  • **Horizontal, not vertical.** The categories are text labels of varying
 *    length ("news.ycombinator.com"). Horizontal bars give each label a full
 *    line to sit on, instead of forcing rotated, overlapping x-axis text.
 *  • **One hue, not one colour per row.** The bars encode a single measure —
 *    magnitude — so colouring each row differently would imply a categorical
 *    distinction that is not in the data. Rank is already conveyed by order
 *    and by length.
 *  • **Direct labels, no axis.** Each row shows its own count and share, so a
 *    numeric axis would be redundant scaffolding.
 *  • **Never a pie chart.** Comparing angles is measurably harder than
 *    comparing aligned lengths, and these lists routinely exceed the two or
 *    three slices a pie can carry.
 */

import { formatNumber, formatPercentage } from '../../lib/format';
import { EmptyState } from '../ui/Feedback';
import type { BreakdownItem } from '../../lib/types';

export interface BreakdownBarsProps {
  /** Rows to display, already ranked highest-first by the API. */
  items: BreakdownItem[];
  /** Message shown when there is nothing to display. */
  emptyMessage?: string;
  /** Maximum rows to render. */
  limit?: number;
  /** Optional label transformer, e.g. to prettify device-type codes. */
  formatLabel?: (label: string) => string;
}

/**
 * Renders a ranked horizontal bar list.
 *
 * @param props Rows and display options.
 * @returns The breakdown element.
 *
 * @example
 * <BreakdownBars items={analytics.devices} formatLabel={formatDeviceLabel} />
 */
export function BreakdownBars({
  items,
  emptyMessage = 'No data for this period yet.',
  limit = 8,
  formatLabel,
}: BreakdownBarsProps): React.JSX.Element {
  if (items.length === 0) {
    return <EmptyState title="Nothing to show" description={emptyMessage} />;
  }

  const rows = items.slice(0, limit);
  // Bars are scaled against the largest row rather than against 100%, so the
  // comparison between rows uses the full available width.
  const maxCount = Math.max(...rows.map((row) => row.count), 1);

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => {
        const widthPercent = (row.count / maxCount) * 100;
        const label = formatLabel ? formatLabel(row.label) : row.label;

        return (
          <li key={row.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-content" title={label}>
                {label}
              </span>
              <span className="shrink-0 tabular-nums text-muted">
                {formatNumber(row.count)}
                <span className="ml-1.5 text-subtle">{formatPercentage(row.percentage)}</span>
              </span>
            </div>

            {/*
              The track is the full-width surface; the fill is the datum.
              `rounded-r` rounds only the data-end — the baseline end stays
              square so every bar starts from the same visual origin.
            */}
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised"
              role="img"
              aria-label={`${label}: ${formatNumber(row.count)} visits, ${formatPercentage(row.percentage)}`}
            >
              <div
                className="h-full rounded-r-full bg-[var(--color-series-1)] transition-[width] duration-500"
                style={{ width: `${Math.max(widthPercent, 1.5)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Human-readable names for the device codes the backend stores. */
const DEVICE_LABELS: Record<string, string> = {
  desktop: 'Desktop',
  mobile: 'Mobile',
  tablet: 'Tablet',
  bot: 'Bot / crawler',
  unknown: 'Unknown',
};

/**
 * Prettifies a device-type code for display.
 *
 * @param code Raw device type from the API.
 * @returns A human-readable label.
 *
 * @example
 * formatDeviceLabel('bot'); // 'Bot / crawler'
 */
export function formatDeviceLabel(code: string): string {
  return DEVICE_LABELS[code] ?? code;
}
