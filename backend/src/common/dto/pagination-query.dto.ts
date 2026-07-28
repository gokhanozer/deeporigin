/**
 * Base query DTO providing `page` and `pageSize` to any list endpoint.
 *
 * Feature-specific query DTOs extend this class, so pagination is declared,
 * validated and documented once rather than per controller.
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants/app.constants';

export class PaginationQueryDto {
  /**
   * 1-based page number.
   *
   * `@Type(() => Number)` is required because query-string values arrive as
   * strings; without it `@IsInt()` would reject every request.
   */
  @ApiPropertyOptional({ minimum: 1, default: 1, description: '1-based page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer' })
  @Min(1, { message: 'page must be at least 1' })
  page?: number = 1;

  /** Items per page, capped server-side at {@link MAX_PAGE_SIZE}. */
  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    default: DEFAULT_PAGE_SIZE,
    description: 'Number of items per page',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize must be an integer' })
  @Min(1, { message: 'pageSize must be at least 1' })
  @Max(MAX_PAGE_SIZE, { message: `pageSize cannot exceed ${MAX_PAGE_SIZE}` })
  pageSize?: number = DEFAULT_PAGE_SIZE;
}
