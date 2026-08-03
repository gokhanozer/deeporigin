/**
 * Look-back windows offered by the analytics period selector.
 *
 * Defined once and shared by the dashboard and the per-link analytics page.
 * They were previously duplicated in both, which is exactly the kind of list
 * that drifts — one gets a new option, the other silently does not.
 */

/** A selectable analytics window. */
export interface AnalyticsPeriod {
  /** Value sent to the API as `?days=`. */
  days: number;
  /** Label shown on the toggle. */
  label: string;
}

/**
 * Available windows, shortest first.
 *
 * **All windows are day-bucketed**, because the API's `?days=` parameter is an
 * integer and the series is built from UTC calendar days. That sets the floor at
 * one day: `days=1` renders a single point, which is a legitimate "today so far"
 * figure but not a trend.
 *
 * Sub-day windows (6h, 1h…) are deliberately absent. They would need hourly
 * bucketing throughout the analytics path, and the question they answer — "how
 * is traffic right now?" — is already answered better by Prometheus and Grafana,
 * which scrape every 15 seconds. Duplicating that here would mean two systems
 * answering the same question, one of them worse.
 */
export const ANALYTICS_PERIODS: readonly AnalyticsPeriod[] = [
  { days: 1, label: '24 hours' },
  { days: 3, label: '3 days' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

/** Window selected on first load. A month reads as a trend without being noisy. */
export const DEFAULT_ANALYTICS_PERIOD_DAYS = 30;

/** Scope of the figures shown: everyone's links, or only the caller's. */
export type LinkScope = 'all' | 'mine';

/**
 * Scope options for the "All links / My links" switch.
 *
 * Shared by the link list and the dashboard so the two cannot drift in wording
 * or ordering — a user switching between the pages should see the same control.
 */
export const SCOPE_OPTIONS: ReadonlyArray<{ value: LinkScope; label: string }> = [
  { value: 'all', label: 'All links' },
  { value: 'mine', label: 'My links' },
];
