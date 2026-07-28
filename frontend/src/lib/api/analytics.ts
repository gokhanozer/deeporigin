/**
 * Analytics endpoints.
 */

import { apiRequest } from '../api-client';
import type { AnalyticsOverview, LinkAnalytics } from '../types';

/**
 * Fetches the dashboard overview.
 *
 * Scope follows the token: signed in returns the caller's links, anonymous
 * returns public system-wide totals.
 *
 * @param days Look-back window in days. Defaults to 30 server-side.
 * @returns Totals, trend, top links and breakdowns.
 */
export function getOverview(days?: number): Promise<AnalyticsOverview> {
  return apiRequest<AnalyticsOverview>('/analytics/overview', { query: { days } });
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
