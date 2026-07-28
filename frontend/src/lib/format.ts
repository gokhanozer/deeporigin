/**
 * Display formatting helpers.
 *
 * Centralised so that a number or a date is rendered identically wherever it
 * appears — a list, a stat tile, a chart axis or a tooltip.
 */

/**
 * Formats an integer with locale-aware thousands separators.
 *
 * @param value Number to format.
 * @returns e.g. `'1,234'`.
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

/**
 * Formats a count compactly for tight spaces such as stat tiles.
 *
 * @param value Number to format.
 * @returns e.g. `'1.2K'`, `'3.4M'`.
 */
export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * Formats a date as a short absolute date.
 *
 * @param value ISO date string or `Date`.
 * @returns e.g. `'27 Jul 2026'`, or `'—'` for a missing value.
 */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/**
 * Formats a `YYYY-MM-DD` key as a compact chart-axis label.
 *
 * The `T00:00:00Z` suffix forces UTC parsing, which keeps the label aligned
 * with the UTC buckets the backend produced.
 *
 * @param dateKey Date key from a time-series.
 * @returns e.g. `'27 Jul'`.
 */
export function formatDateKeyShort(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateKey;

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

/** Thresholds for {@link formatRelativeTime}, largest unit first. */
const RELATIVE_UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
];

/**
 * Formats a timestamp as a relative phrase.
 *
 * @param value ISO date string or `Date`.
 * @returns e.g. `'3 days ago'`, `'just now'`, or `'Never'` when absent.
 */
export function formatRelativeTime(value: string | Date | null | undefined): string {
  if (!value) return 'Never';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return 'Never';

  const elapsed = Date.now() - date.getTime();
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(elapsed) >= ms) {
      return formatter.format(-Math.round(elapsed / ms), unit);
    }
  }
  return 'just now';
}

/**
 * Truncates a string in the middle, preserving both ends.
 *
 * Better than a trailing ellipsis for URLs, where the final path segment is
 * often the most identifying part.
 *
 * @param value     Text to shorten.
 * @param maxLength Maximum output length.
 * @returns The elided string.
 */
export function truncateMiddle(value: string, maxLength = 60): string {
  if (value.length <= maxLength) return value;
  const keep = Math.floor((maxLength - 1) / 2);
  return `${value.slice(0, keep)}…${value.slice(-keep)}`;
}

/**
 * Strips the scheme and any `www.` prefix, for compact display.
 *
 * @param url Full URL.
 * @returns e.g. `'example.com/foo'`.
 */
export function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
}

/**
 * Formats a 0–100 share as a percentage string.
 *
 * @param value Percentage value.
 * @returns e.g. `'63.4%'`.
 */
export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Chooses between singular and plural forms.
 *
 * @param count    The count deciding the form.
 * @param singular Singular noun.
 * @param plural   Plural noun. Defaults to `singular + 's'`.
 * @returns The correct form for the count.
 *
 * @example
 * `${formatNumber(n)} ${pluralize(n, 'visit')}`; // '1 visit' / '4 visits'
 */
export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}
