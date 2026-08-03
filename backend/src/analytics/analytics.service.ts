/**
 * Aggregation logic behind the popularity dashboard.
 *
 * Design note — why the raw `visits` rows are read into memory and aggregated
 * in TypeScript rather than with `GROUP BY` in SQL:
 *
 *   • one query returns everything needed for *five* different breakdowns
 *     (time-series, referrer, device, browser, OS), instead of five round-trips;
 *   • the shared, unit-tested helpers in `common/utils/date.util.ts` do the
 *     bucketing, so the same code produces the same numbers everywhere;
 *   • the query is bounded by an indexed date window, so the row count stays
 *     proportional to recent traffic rather than to table size.
 *
 * At genuinely large volumes this would move to `GROUP BY` with a pre-rolled
 * daily summary table; the trade-off is called out in `docs/IMPLEMENTATION.md`.
 */

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { buildDailySeries, countByValue, daysAgo } from '../common/utils/date.util';
import { DEFAULT_ANALYTICS_DAYS } from '../common/constants/app.constants';
import { toLinkDto, toLinkDtoList } from '../links/links.mapper';
import type {
  AnalyticsOverviewDto,
  BreakdownItemDto,
  LinkAnalyticsDto,
} from './dto/analytics.dto';

/** Number of links shown in the "most popular" table. */
const TOP_LINKS_LIMIT = 10;

/** Number of rows kept in each categorical breakdown. */
const BREAKDOWN_LIMIT = 8;

/** The visit columns every aggregation needs. */
const VISIT_SELECTION = {
  occurredAt: true,
  referrer: true,
  deviceType: true,
  browser: true,
  os: true,
  ipHash: true,
} satisfies Prisma.VisitSelect;

/** Shape returned by the visit query above. */
type VisitRow = {
  occurredAt: Date;
  referrer: string | null;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  ipHash: string | null;
};

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Builds the dashboard overview.
   *
   * Scope follows authentication: a signed-in caller sees their own links, an
   * anonymous caller sees public, system-wide totals. That keeps the landing
   * page informative without exposing anyone's private numbers.
   *
   * @param days   Look-back window in days.
   * @param userId Authenticated user's ID, or `undefined`.
   * @returns The full overview payload.
   */
  async getOverview(
    days = DEFAULT_ANALYTICS_DAYS,
    userId?: string,
    mineOnly = true,
  ): Promise<AnalyticsOverviewDto> {
    const since = daysAgo(days);

    // Scoping requires BOTH an identity and the caller asking for it. A
    // signed-in user can therefore opt into the public view (`mineOnly=false`)
    // without signing out — which is what the dashboard's scope switch does.
    const scopeToUser = Boolean(userId) && mineOnly;
    const ownerId = scopeToUser ? userId : undefined;

    const linkWhere: Prisma.LinkWhereInput = ownerId ? { ownerId } : {};
    const visitWhere: Prisma.VisitWhereInput = {
      occurredAt: { gte: since },
      ...(ownerId ? { link: { ownerId } } : {}),
    };

    // One transaction: every number on the dashboard describes the same instant.
    const [totalLinks, activeLinks, visitSum, topLinks, visits] = await this.prisma.$transaction([
      this.prisma.link.count({ where: linkWhere }),
      this.prisma.link.count({
        where: {
          ...linkWhere,
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
      this.prisma.link.aggregate({ where: linkWhere, _sum: { visitCount: true } }),
      this.prisma.link.findMany({
        where: linkWhere,
        orderBy: [{ visitCount: 'desc' }, { createdAt: 'desc' }],
        take: TOP_LINKS_LIMIT,
      }),
      this.prisma.visit.findMany({ where: visitWhere, select: VISIT_SELECTION }),
    ]);

    const totalVisits = visitSum._sum.visitCount ?? 0;

    return {
      totals: {
        totalLinks,
        totalVisits,
        visitsInPeriod: visits.length,
        uniqueVisitors: countDistinctVisitors(visits),
        activeLinks,
        averageVisitsPerLink: totalLinks > 0 ? round1(totalVisits / totalLinks) : 0,
      },
      visitsOverTime: buildDailySeries(
        visits.map((visit) => visit.occurredAt),
        days,
      ),
      topLinks: toLinkDtoList(topLinks, this.publicBaseUrl, userId),
      referrers: toBreakdown(visits.map((v) => v.referrer), visits.length, 'Direct'),
      devices: toBreakdown(visits.map((v) => v.deviceType), visits.length, 'unknown'),
      browsers: toBreakdown(visits.map((v) => v.browser), visits.length, 'Unknown'),
      periodDays: days,
      scopedToUser: scopeToUser,
    };
  }

  /**
   * Builds the analytics detail view for a single link.
   *
   * @param linkId   Link to report on.
   * @param days     Look-back window in days.
   * @param viewerId Requesting user's ID, if authenticated.
   * @returns The per-link analytics payload.
   * @throws {NotFoundException}  When the link does not exist.
   * @throws {ForbiddenException} When the link is owned by somebody else.
   */
  async getLinkAnalytics(
    linkId: string,
    days = DEFAULT_ANALYTICS_DAYS,
    viewerId?: string,
  ): Promise<LinkAnalyticsDto> {
    const link = await this.prisma.link.findUnique({ where: { id: linkId } });
    if (!link) throw new NotFoundException('Link not found');

    // Anonymous links are public (they appear in the public list, so their
    // stats are not a secret). An owned link is private to its owner.
    if (link.ownerId && link.ownerId !== viewerId) {
      throw new ForbiddenException('You do not have permission to view these analytics');
    }

    const since = daysAgo(days);
    const [visits, uniqueRows] = await this.prisma.$transaction([
      this.prisma.visit.findMany({
        where: { linkId, occurredAt: { gte: since } },
        select: VISIT_SELECTION,
      }),
      this.prisma.visit.findMany({
        where: { linkId, ipHash: { not: null } },
        distinct: ['ipHash'],
        select: { ipHash: true },
      }),
    ]);

    return {
      link: toLinkDto(link, this.publicBaseUrl, viewerId),
      visitsOverTime: buildDailySeries(
        visits.map((visit) => visit.occurredAt),
        days,
      ),
      referrers: toBreakdown(visits.map((v) => v.referrer), visits.length, 'Direct'),
      devices: toBreakdown(visits.map((v) => v.deviceType), visits.length, 'unknown'),
      browsers: toBreakdown(visits.map((v) => v.browser), visits.length, 'Unknown'),
      operatingSystems: toBreakdown(visits.map((v) => v.os), visits.length, 'Unknown'),
      uniqueVisitors: uniqueRows.length,
      visitsInPeriod: visits.length,
      periodDays: days,
    };
  }

  /** Configured public base URL, used when mapping links to DTOs. */
  private get publicBaseUrl(): string {
    return this.config.get('publicBaseUrl', { infer: true });
  }
}

// -----------------------------------------------------------------------------
// Pure helpers — exported for direct unit testing.
// -----------------------------------------------------------------------------

/**
 * Rounds to one decimal place.
 *
 * @param value Any number.
 * @returns The value rounded to 0.1 precision.
 */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Turns a column of raw values into a ranked breakdown with percentages.
 *
 * @param values        Raw column values, possibly containing nulls.
 * @param total         Denominator for the percentage (the visit count).
 * @param fallbackLabel Label to use in place of null/empty values.
 * @returns Descending breakdown rows, capped at {@link BREAKDOWN_LIMIT}.
 *
 * @example
 * toBreakdown(['Chrome', null, 'Chrome'], 3, 'Unknown');
 * // [ { label: 'Chrome', count: 2, percentage: 66.7 },
 * //   { label: 'Unknown', count: 1, percentage: 33.3 } ]
 */
export function toBreakdown(
  values: Array<string | null | undefined>,
  total: number,
  fallbackLabel: string,
): BreakdownItemDto[] {
  return countByValue(values, BREAKDOWN_LIMIT, fallbackLabel).map(({ label, count }) => ({
    label,
    count,
    percentage: total > 0 ? round1((count / total) * 100) : 0,
  }));
}

/**
 * Counts distinct non-null IP hashes.
 *
 * @param visits Visit rows.
 * @returns The number of distinct visitors.
 */
export function countDistinctVisitors(visits: Array<Pick<VisitRow, 'ipHash'>>): number {
  const seen = new Set<string>();
  for (const visit of visits) {
    if (visit.ipHash) seen.add(visit.ipHash);
  }
  return seen.size;
}
