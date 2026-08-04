/**
 * Shared API types.
 *
 * These mirror the backend DTOs. In a monorepo they would live in a shared
 * package imported by both sides; keeping a single hand-maintained file here
 * avoids a build-tooling dependency for a two-app project, at the cost of
 * having to keep the two in step. The trade-off is documented in
 * `docs/IMPLEMENTATION.md`.
 */

/** A shortened link, as returned by the API. */
export interface Link {
  id: string;
  /** The short code, e.g. `abc123`. */
  slug: string;
  /** Fully-qualified short URL, ready to copy. */
  shortUrl: string;
  /** Where the slug redirects to. */
  targetUrl: string;
  /** Destination hostname, or `null` if unparseable. */
  domain: string | null;
  title: string | null;
  visitCount: number;
  lastVisitedAt: string | null;
  isActive: boolean;
  isCustomSlug: boolean;
  expiresAt: string | null;
  /** `true` when the signed-in user may edit or delete this link. */
  isOwner: boolean;
  /** `true` when the link was created without an account. */
  isAnonymous: boolean;
  /**
   * `true` when the viewer may open this link's analytics page.
   *
   * True for your own links and for anonymous ones. Reported by the API so the
   * UI never has to re-derive the rule the API enforces.
   */
  canViewAnalytics: boolean;
  createdAt: string;
  updatedAt: string;
  /**
   * Set by `POST /links` when it returned a link the caller had already created
   * for this URL, rather than creating a second one. Absent on reads.
   */
  alreadyExisted?: boolean;
}

/** An authenticated account. */
export interface User {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

/** Response from the register and login endpoints. */
export interface AuthResponse {
  accessToken: string;
  user: User;
}

/** Pagination metadata attached to every list response. */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

/** Standard envelope for paginated endpoints. */
export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

/** One point in a daily time-series. */
export interface DailyCount {
  /** `YYYY-MM-DD`, UTC. */
  date: string;
  count: number;
}

/** One row of a categorical breakdown. */
export interface BreakdownItem {
  label: string;
  count: number;
  /** Share of the total, 0–100. */
  percentage: number;
}

/** Headline dashboard numbers. */
export interface AnalyticsTotals {
  totalLinks: number;
  totalVisits: number;
  visitsInPeriod: number;
  uniqueVisitors: number;
  activeLinks: number;
  averageVisitsPerLink: number;
}

/** Full dashboard overview payload. */
export interface AnalyticsOverview {
  totals: AnalyticsTotals;
  visitsOverTime: DailyCount[];
  topLinks: Link[];
  referrers: BreakdownItem[];
  devices: BreakdownItem[];
  browsers: BreakdownItem[];
  periodDays: number;
  /** `true` when the figures cover only the signed-in user's links. */
  scopedToUser: boolean;
}

/** Per-link analytics payload. */
export interface LinkAnalytics {
  link: Link;
  visitsOverTime: DailyCount[];
  referrers: BreakdownItem[];
  devices: BreakdownItem[];
  browsers: BreakdownItem[];
  operatingSystems: BreakdownItem[];
  uniqueVisitors: number;
  visitsInPeriod: number;
  periodDays: number;
}

/** Fields sortable in the link list. Mirrors the backend allow-list. */
export type LinkSortField = 'createdAt' | 'visitCount' | 'lastVisitedAt' | 'slug';

/** Query parameters accepted by the link list endpoint. */
export interface ListLinksParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: LinkSortField;
  sortOrder?: 'asc' | 'desc';
  mineOnly?: boolean;
}

/** Payload for creating a link. */
export interface CreateLinkPayload {
  url: string;
  slug?: string;
  title?: string;
  expiresAt?: string;
}

/** Payload for updating a link. Only the supplied fields change. */
export interface UpdateLinkPayload {
  slug?: string;
  url?: string;
  title?: string;
  isActive?: boolean;
  expiresAt?: string | null;
}

/** Result of the slug-availability check. */
export interface SlugAvailability {
  available: boolean;
  reason?: string;
}

/** The uniform error body produced by the backend's exception filter. */
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  details?: string[];
  path: string;
  timestamp: string;
}
