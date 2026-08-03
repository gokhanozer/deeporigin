/**
 * Dashboard analytics endpoints.
 */

import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';
import { AnalyticsOverviewDto, AnalyticsQueryDto, LinkAnalyticsDto } from './dto/analytics.dto';

@ApiTags('analytics')
@Controller('analytics')
@UseGuards(OptionalJwtAuthGuard)
@ApiBearerAuth()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Returns the dashboard overview — the caller's links when signed in,
   * system-wide public totals otherwise.
   *
   * @param query  Window options (`days`).
   * @param userId Authenticated user's ID, if any.
   * @returns Totals, time-series, top links and breakdowns.
   */
  @Get('overview')
  @ApiOperation({ summary: 'Dashboard overview: totals, trend, top links, breakdowns' })
  @ApiResponse({ status: 200, type: AnalyticsOverviewDto })
  getOverview(
    @Query() query: AnalyticsQueryDto,
    @CurrentUser('id') userId?: string,
  ): Promise<AnalyticsOverviewDto> {
    return this.analyticsService.getOverview(query.days, userId, query.mineOnly);
  }

  /**
   * Returns the analytics detail for one link.
   *
   * @param id     Link ID.
   * @param query  Window options (`days`).
   * @param userId Authenticated user's ID, if any.
   * @returns Per-link time-series and breakdowns.
   */
  @Get('links/:id')
  @ApiOperation({ summary: 'Analytics for a single link' })
  @ApiResponse({ status: 200, type: LinkAnalyticsDto })
  @ApiResponse({ status: 403, description: 'Link belongs to another user' })
  getLinkAnalytics(
    @Param('id') id: string,
    @Query() query: AnalyticsQueryDto,
    @CurrentUser('id') userId?: string,
  ): Promise<LinkAnalyticsDto> {
    return this.analyticsService.getLinkAnalytics(id, query.days, userId);
  }
}
