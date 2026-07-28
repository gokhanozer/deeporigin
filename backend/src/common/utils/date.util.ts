/**
 * Date bucketing helpers for the analytics time-series.
 *
 * All work is done in **UTC**. Mixing the server's local timezone into date
 * bucketing is a classic source of off-by-one-day bugs in dashboards, and it
 * makes charts shift whenever the server moves region or crosses a DST
 * boundary.
 */

/** A single point in a daily time-series. */
export interface DailyCount {
  /** Day in `YYYY-MM-DD` form (UTC). */
  date: string;
  /** Number of events recorded on that day. */
  count: number;
}

/** Number of milliseconds in a day. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Truncates a date to midnight UTC.
 *
 * @param date Any date.
 * @returns A new `Date` at 00:00:00.000 UTC on the same calendar day.
 */
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Formats a date as a `YYYY-MM-DD` UTC key.
 *
 * This is the join key between database rows and chart buckets, so it must be
 * produced the same way everywhere — hence a single function.
 *
 * @param date Any date.
 * @returns The ISO calendar date, e.g. `'2026-07-27'`.
 */
export function toUtcDateKey(date: Date): string {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

/**
 * Returns the instant `days` days before `from`, truncated to midnight UTC.
 *
 * @param days Number of days to look back.
 * @param from Reference point. Defaults to now.
 * @returns The start of the look-back window.
 *
 * @example
 * daysAgo(7); // midnight UTC, one week ago
 */
export function daysAgo(days: number, from: Date = new Date()): Date {
  return startOfUtcDay(new Date(from.getTime() - days * MS_PER_DAY));
}

/**
 * Produces a continuous list of UTC date keys covering a window.
 *
 * Grouping visits in SQL only yields rows for days that actually had traffic,
 * which would render as a chart with missing columns. Zipping that sparse
 * result against this dense series is what gives a gap-free chart.
 *
 * @param days Window length in days, inclusive of today.
 * @param end  Last day in the series. Defaults to today.
 * @returns Ascending array of `YYYY-MM-DD` keys, length `days`.
 *
 * @example
 * buildDateRange(3); // ['2026-07-25', '2026-07-26', '2026-07-27']
 */
export function buildDateRange(days: number, end: Date = new Date()): string[] {
  const lastDay = startOfUtcDay(end);
  const keys: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    keys.push(toUtcDateKey(new Date(lastDay.getTime() - offset * MS_PER_DAY)));
  }
  return keys;
}

/**
 * Converts sparse event timestamps into a dense daily series.
 *
 * @param timestamps Raw event dates (unsorted is fine).
 * @param days       Window length in days.
 * @param end        Last day of the window. Defaults to today.
 * @returns One {@link DailyCount} per day in the window, ascending, zero-filled.
 *
 * @example
 * buildDailySeries([new Date('2026-07-27T10:00Z')], 2);
 * // [ { date: '2026-07-26', count: 0 }, { date: '2026-07-27', count: 1 } ]
 */
export function buildDailySeries(
  timestamps: Date[],
  days: number,
  end: Date = new Date(),
): DailyCount[] {
  // Tally first: one pass over the events, then one pass over the window.
  const tally = new Map<string, number>();
  for (const timestamp of timestamps) {
    const key = toUtcDateKey(timestamp);
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }

  return buildDateRange(days, end).map((date) => ({ date, count: tally.get(date) ?? 0 }));
}

/**
 * Counts occurrences of each value and returns them ranked, highest first.
 *
 * Powers the "top referrers", "browsers" and "devices" breakdowns from a single
 * implementation.
 *
 * @param values     Raw values; `null`/`undefined` entries fall back to `fallbackLabel`.
 * @param limit      Maximum number of buckets to return. Defaults to 10.
 * @param fallbackLabel Label used for missing values. Defaults to `'Direct'`.
 * @returns Descending array of `{ label, count }`.
 *
 * @example
 * countByValue(['t.co', null, 't.co'], 5);
 * // [ { label: 't.co', count: 2 }, { label: 'Direct', count: 1 } ]
 */
export function countByValue(
  values: Array<string | null | undefined>,
  limit = 10,
  fallbackLabel = 'Direct',
): Array<{ label: string; count: number }> {
  const tally = new Map<string, number>();
  for (const value of values) {
    const label = value && value.length > 0 ? value : fallbackLabel;
    tally.set(label, (tally.get(label) ?? 0) + 1);
  }

  return [...tally.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}
