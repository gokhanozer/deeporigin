/**
 * REST endpoints for managing short links.
 *
 * Guard strategy:
 *  • `POST /links`  — {@link OptionalJwtAuthGuard}: anyone may shorten a URL,
 *                     and signing in simply attaches ownership.
 *  • `GET  /links`  — optional too, so the public list works while an owner
 *                     still sees `isOwner: true` on their own rows.
 *  • mutations      — {@link LinkOwnerAuthGuard}: editing requires a proven
 *                     identity, and the rejection says to create a new link
 *                     instead of leaving the caller at a bare `401`.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ThrottleCreate } from '../common/decorators/throttle.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { PaginatedResult } from '../common/utils/pagination.util';
import { LinkOwnerAuthGuard, OptionalJwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LinksService } from './links.service';
import {
  CreateLinkDto,
  LinkResponseDto,
  ListLinksQueryDto,
  UpdateLinkDto,
} from './dto/link.dto';

@ApiTags('links')
@Controller('links')
export class LinksController {
  constructor(private readonly linksService: LinksService) {}

  /**
   * Shortens a URL.
   *
   * Rate-limited with the tighter `create` bucket: this is the endpoint that
   * writes rows and the one a spammer would target.
   *
   * @param dto    Creation payload.
   * @param userId Owner's ID, or `undefined` when anonymous.
   * @returns The created link, including its ready-to-use `shortUrl`.
   */
  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  @ThrottleCreate()
  @ApiOperation({ summary: 'Create a short link' })
  @ApiResponse({ status: 201, type: LinkResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid URL or slug' })
  @ApiResponse({ status: 409, description: 'Requested slug already taken' })
  create(
    @Body() dto: CreateLinkDto,
    @CurrentUser('id') userId?: string,
  ): Promise<LinkResponseDto> {
    return this.linksService.create(dto, userId);
  }

  /**
   * Lists links — every link in the database by default, or only the caller's
   * own when `mineOnly=true`.
   *
   * @param query  Filter, sort and pagination options.
   * @param userId Requesting user's ID, if authenticated.
   * @returns A paginated envelope of links.
   */
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'List links' })
  @ApiQuery({ name: 'mineOnly', required: false, description: 'Restrict to the caller’s links' })
  @ApiResponse({ status: 200, type: [LinkResponseDto] })
  findMany(
    @Query() query: ListLinksQueryDto,
    @CurrentUser('id') userId?: string,
  ): Promise<PaginatedResult<LinkResponseDto>> {
    return this.linksService.findMany(query, userId);
  }

  /**
   * Checks whether a slug is available, for live validation in the UI.
   *
   * Declared before `:id` so the literal path segment wins the route match.
   *
   * @param slug Candidate slug.
   * @returns Availability, with a reason when unavailable.
   */
  @Get('slug-available/:slug')
  @ApiOperation({ summary: 'Check whether a slug can be used' })
  checkSlug(@Param('slug') slug: string): Promise<{ available: boolean; reason?: string }> {
    return this.linksService.checkSlugAvailability(slug);
  }

  /**
   * Fetches a single link by ID.
   *
   * @param id     Link ID.
   * @param userId Requesting user's ID, if authenticated.
   * @returns The link.
   */
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get a single link' })
  @ApiResponse({ status: 404, description: 'Link not found' })
  findOne(
    @Param('id') id: string,
    @CurrentUser('id') userId?: string,
  ): Promise<LinkResponseDto> {
    return this.linksService.findOne(id, userId);
  }

  /**
   * Updates a link — most importantly, changes its slug.
   *
   * @param id     Link ID.
   * @param dto    Fields to change.
   * @param userId Authenticated owner's ID.
   * @returns The updated link.
   */
  @Patch(':id')
  @UseGuards(LinkOwnerAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a link (including its slug)' })
  @ApiResponse({ status: 401, description: 'Anonymous caller — links can only be edited by their owner' })
  @ApiResponse({ status: 403, description: 'Caller does not own the link' })
  @ApiResponse({ status: 409, description: 'Requested slug already taken' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLinkDto,
    @CurrentUser('id') userId: string,
  ): Promise<LinkResponseDto> {
    return this.linksService.update(id, dto, userId);
  }

  /**
   * Deletes a link and all of its recorded visits.
   *
   * @param id     Link ID.
   * @param userId Authenticated owner's ID.
   */
  @Delete(':id')
  @UseGuards(LinkOwnerAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a link' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  @ApiResponse({ status: 401, description: 'Anonymous caller — links can only be deleted by their owner' })
  remove(@Param('id') id: string, @CurrentUser('id') userId: string): Promise<void> {
    return this.linksService.remove(id, userId);
  }
}
