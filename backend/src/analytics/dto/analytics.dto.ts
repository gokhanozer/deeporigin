/**
 * DTOs describing the analytics payloads consumed by the dashboard.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  DEFAULT_ANALYTICS_DAYS,
  MAX_ANALYTICS_DAYS,
} from '../../common/constants/app.constants';
import type { LinkResponseDto } from '../../links/dto/link.dto';

/** Query parameters accepted by every analytics endpoint. */
export class AnalyticsQueryDto {
  /** Size of the look-back window, in days. */
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_ANALYTICS_DAYS, default: DEFAULT_ANALYTICS_DAYS })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'days must be an integer' })
  @Min(1, { message: 'days must be at least 1' })
  @Max(MAX_ANALYTICS_DAYS, { message: `days cannot exceed ${MAX_ANALYTICS_DAYS}` })
  days?: number = DEFAULT_ANALYTICS_DAYS;

  /**
   * Restrict the figures to the caller's own links.
   *
   * Defaults to **true**, which preserves the previous behaviour: a signed-in
   * caller sees their own numbers. Passing `false` opts into the public,
   * system-wide view while staying authenticated — which is what the
   * dashboard's "All links / My links" switch sends.
   *
   * Ignored for anonymous callers, who can only ever see public totals.
   *
   * ⚠️ `@Transform` only — never `@Type(() => Boolean)`. Query values arrive as
   * strings and `Boolean('false')` is `true`, which silently inverts the flag.
   * That exact bug shipped in `ListLinksQueryDto` and caused 403s; see
   * `links/dto/link.dto.spec.ts`.
   */
  @ApiPropertyOptional({ default: true, description: 'Scope figures to the caller’s own links' })
  @IsOptional()
  @Transform(({ value }) => value !== false && value !== 'false')
  @IsBoolean()
  mineOnly?: boolean = true;
}

/** One point in a daily time-series. */
export class DailyCountDto {
  @ApiProperty({ example: '2026-07-27' })
  date!: string;

  @ApiProperty({ example: 42 })
  count!: number;
}

/** One row in a categorical breakdown (referrer, device, browser…). */
export class BreakdownItemDto {
  @ApiProperty({ example: 'Chrome' })
  label!: string;

  @ApiProperty({ example: 128 })
  count!: number;

  /** Share of the total, 0–100, rounded to one decimal place. */
  @ApiProperty({ example: 63.4 })
  percentage!: number;
}

/** Headline numbers shown as stat tiles at the top of the dashboard. */
export class AnalyticsTotalsDto {
  @ApiProperty({ description: 'Links in scope' })
  totalLinks!: number;

  @ApiProperty({ description: 'All-time redirects served for those links' })
  totalVisits!: number;

  @ApiProperty({ description: 'Redirects within the selected window' })
  visitsInPeriod!: number;

  @ApiProperty({ description: 'Distinct hashed IPs within the window' })
  uniqueVisitors!: number;

  @ApiProperty({ description: 'Links that are enabled and unexpired' })
  activeLinks!: number;

  @ApiProperty({ description: 'Mean all-time visits per link, to one decimal' })
  averageVisitsPerLink!: number;
}

/** Full payload for the dashboard overview. */
export class AnalyticsOverviewDto {
  @ApiProperty({ type: AnalyticsTotalsDto })
  totals!: AnalyticsTotalsDto;

  /** Gap-free daily visit counts across the window. */
  @ApiProperty({ type: [DailyCountDto] })
  visitsOverTime!: DailyCountDto[];

  /** Most-visited links, highest first. */
  @ApiProperty({ description: 'Most popular links in scope' })
  topLinks!: LinkResponseDto[];

  @ApiProperty({ type: [BreakdownItemDto] })
  referrers!: BreakdownItemDto[];

  @ApiProperty({ type: [BreakdownItemDto] })
  devices!: BreakdownItemDto[];

  @ApiProperty({ type: [BreakdownItemDto] })
  browsers!: BreakdownItemDto[];

  /** Number of days the window covers. */
  @ApiProperty({ example: 30 })
  periodDays!: number;

  /** `true` when the numbers cover only the caller's own links. */
  @ApiProperty({ example: true })
  scopedToUser!: boolean;
}

/** Analytics for one specific link. */
export class LinkAnalyticsDto {
  @ApiProperty()
  link!: LinkResponseDto;

  @ApiProperty({ type: [DailyCountDto] })
  visitsOverTime!: DailyCountDto[];

  @ApiProperty({ type: [BreakdownItemDto] })
  referrers!: BreakdownItemDto[];

  @ApiProperty({ type: [BreakdownItemDto] })
  devices!: BreakdownItemDto[];

  @ApiProperty({ type: [BreakdownItemDto] })
  browsers!: BreakdownItemDto[];

  @ApiProperty({ type: [BreakdownItemDto] })
  operatingSystems!: BreakdownItemDto[];

  @ApiProperty({ description: 'Distinct hashed IPs, all time' })
  uniqueVisitors!: number;

  @ApiProperty({ description: 'Redirects within the window' })
  visitsInPeriod!: number;

  @ApiProperty()
  periodDays!: number;
}
