/**
 * Analytics endpoints.
 */

import { apiRequest } from '../api-client';
import type { AnalyticsOverview, LinkAnalytics } from '../types';

/**
 * Fetches the dashboard overview.
 *
 * Scope follows the token AND the caller's request: anonymous always returns
 * public system-wide totals, while a signed-in caller gets their own figures
 * unless `mineOnly` is explicitly `false`.
 *
 * @param days     Look-back window in days. Defaults to 30 server-side.
 * @param mineOnly Restrict to the caller's own links. Defaults to true server-side.
 * @returns Totals, trend, top links and breakdowns.
 */
export function getOverview(days?: number, mineOnly?: boolean): Promise<AnalyticsOverview> {
  return apiRequest<AnalyticsOverview>('/analytics/overview', { query: { days, mineOnly } });
}

/**
 * Fetches analytics for one link.
 *
 * @param linkId Link ID.
 * @param days   Look-back window in days.
 * @returns Per-link time-series and breakdowns.
 */
export function getLinkAnalytics(linkId: string, days?: number): Promise<LinkAnalytics> {
  return apiRequest<LinkAnalytics>(`/analytics/links/${linkId}`, { query: { days } });
}
