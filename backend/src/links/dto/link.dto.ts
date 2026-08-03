/**
 * DTOs for the links API.
 *
 * Validation here handles *shape* (types, lengths, character sets). Semantic
 * validation that needs configuration or the database — is this URL private?
 * is this slug already taken? — lives in `LinksService`, since a DTO cannot
 * inject dependencies.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  MAX_TITLE_LENGTH,
  MAX_URL_LENGTH,
  SLUG_MAX_LENGTH,
  SLUG_MIN_LENGTH,
  SLUG_PATTERN,
} from '../../common/constants/app.constants';

/** Trims a string field, leaving non-strings untouched for the validator to reject. */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Payload for `POST /links`. */
export class CreateLinkDto {
  /** Destination URL. Accepts input without a scheme (`example.com`). */
  @ApiProperty({ example: 'https://some.place.example.com/foo/bar/biz' })
  @Transform(trim)
  @IsString({ message: 'URL is required' })
  @MinLength(1, { message: 'URL is required' })
  @MaxLength(MAX_URL_LENGTH, { message: `URL must be at most ${MAX_URL_LENGTH} characters` })
  url!: string;

  /**
   * Optional custom slug. When omitted, a random one is generated.
   * Satisfies the "allow users to modify the slug" requirement at creation time.
   */
  @ApiPropertyOptional({ example: 'my-link', minLength: SLUG_MIN_LENGTH })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(SLUG_MIN_LENGTH, { message: `Slug must be at least ${SLUG_MIN_LENGTH} characters` })
  @MaxLength(SLUG_MAX_LENGTH, { message: `Slug must be at most ${SLUG_MAX_LENGTH} characters` })
  @Matches(SLUG_PATTERN, {
    message: 'Slug may only contain letters, numbers, hyphens and underscores',
  })
  slug?: string;

  /** Optional label to make long link lists scannable. */
  @ApiPropertyOptional({ example: 'Q3 campaign landing page' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(MAX_TITLE_LENGTH)
  title?: string;

  /** Optional ISO-8601 expiry. After this instant the link stops resolving. */
  @ApiPropertyOptional({ example: '2026-12-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString({}, { message: 'expiresAt must be a valid ISO-8601 date' })
  expiresAt?: string;
}

/**
 * Payload for `PATCH /links/:id`. Every field is optional — only what is sent
 * gets changed.
 */
export class UpdateLinkDto {
  /** New slug. This is the "allow users to modify the slug" requirement. */
  @ApiPropertyOptional({ example: 'new-slug' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(SLUG_MIN_LENGTH, { message: `Slug must be at least ${SLUG_MIN_LENGTH} characters` })
  @MaxLength(SLUG_MAX_LENGTH, { message: `Slug must be at most ${SLUG_MAX_LENGTH} characters` })
  @Matches(SLUG_PATTERN, {
    message: 'Slug may only contain letters, numbers, hyphens and underscores',
  })
  slug?: string;

  /** New destination URL. */
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(MAX_URL_LENGTH)
  url?: string;

  /** New title, or an empty string to clear it. */
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(MAX_TITLE_LENGTH)
  title?: string;

  /** Enable or disable the link without deleting it. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** New expiry, or `null` to remove it. */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString({}, { message: 'expiresAt must be a valid ISO-8601 date' })
  expiresAt?: string | null;
}

/** Fields a link list may be sorted by. */
export const LINK_SORT_FIELDS = ['createdAt', 'visitCount', 'lastVisitedAt', 'slug'] as const;
export type LinkSortField = (typeof LINK_SORT_FIELDS)[number];

/** Query parameters for the link list endpoints. */
export class ListLinksQueryDto extends PaginationQueryDto {
  /** Free-text filter matched against slug, title and destination URL. */
  @ApiPropertyOptional({ description: 'Case-insensitive search across slug, title and URL' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  search?: string;

  /** Column to sort by. */
  @ApiPropertyOptional({ enum: LINK_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(LINK_SORT_FIELDS, { message: `sortBy must be one of: ${LINK_SORT_FIELDS.join(', ')}` })
  sortBy?: LinkSortField = 'createdAt';

  /** Sort direction. */
  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'sortOrder must be "asc" or "desc"' })
  sortOrder?: 'asc' | 'desc' = 'desc';

  /**
   * When true, restrict results to the authenticated user's own links.
   *
   * ⚠️ Do NOT add `@Type(() => Boolean)` here. Query-string values arrive as
   * strings, and `Boolean('false')` is **`true`** — every non-empty string is
   * truthy. With `@Type` in place, `?mineOnly=false` was parsed as `true`,
   * which made the service reject anonymous requests with
   * `403 You must be signed in to view your links` — the exact opposite of what
   * the caller asked for.
   *
   * `@Transform` alone is correct: it inspects the raw value and only the
   * literal string `'true'` (or a real boolean `true`) enables the filter.
   */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  mineOnly?: boolean = false;
}

/** Public representation of a link, as returned by the API. */
export class LinkResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'abc123' })
  slug!: string;

  /** The fully-qualified short URL, pre-built so clients never assemble it. */
  @ApiProperty({ example: 'https://short.ly/abc123' })
  shortUrl!: string;

  @ApiProperty({ example: 'https://some.place.example.com/foo/bar/biz' })
  targetUrl!: string;

  /** Destination hostname, convenient for rendering a favicon or label. */
  @ApiProperty({ example: 'some.place.example.com', nullable: true })
  domain!: string | null;

  @ApiProperty({ nullable: true })
  title!: string | null;

  @ApiProperty()
  visitCount!: number;

  @ApiProperty({ nullable: true })
  lastVisitedAt!: Date | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  isCustomSlug!: boolean;

  @ApiProperty({ nullable: true })
  expiresAt!: Date | null;

  /** `true` when the caller owns this link and may edit or delete it. */
  @ApiProperty()
  isOwner!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
