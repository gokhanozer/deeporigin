/**
 * Headline statistic tile.
 *
 * A single number does not need a chart — it needs to be large and legible.
 * These tiles carry the dashboard's top-line figures, with the chart forms
 * reserved for data that actually has shape.
 */

import type { ReactNode } from 'react';
import { formatCompactNumber, formatNumber } from '../../lib/format';

export interface StatTileProps {
  /** What the number measures. */
  label: string;
  /** The figure itself. */
  value: number;
  /** Optional supporting line, e.g. "in the last 30 days". */
  hint?: string;
  /** Optional decorative glyph. */
  icon?: ReactNode;
  /** Render compactly (`1.2K`). Useful for figures that can grow large. */
  compact?: boolean;
}

/**
 * Renders a single statistic.
 *
 * @param props Tile content and options.
 * @returns The tile element.
 *
 * @example
 * <StatTile label="Total visits" value={totals.totalVisits} hint="all time" />
 */
export function StatTile({
  label,
  value,
  hint,
  icon,
  compact = false,
}: StatTileProps): React.JSX.Element {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-subtle">{label}</p>
        {icon && (
          <span className="text-muted" aria-hidden="true">
            {icon}
          </span>
        )}
      </div>

      {/*
        `tabular-nums` keeps digits monospaced, so a row of tiles does not
        jitter when the numbers change. The full value goes in `title` when
        the display form is abbreviated.
      */}
      <p
        className="mt-2 text-2xl font-semibold tabular-nums text-content"
        title={compact ? formatNumber(value) : undefined}
      >
        {compact ? formatCompactNumber(value) : formatNumber(value)}
      </p>

      {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
    </div>
  );
}
