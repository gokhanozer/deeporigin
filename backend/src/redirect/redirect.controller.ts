/**
 * Slug resolution endpoints.
 *
 * Two entry points exist because short links can be served from either domain:
 *
 *  1. `POST /api/v1/redirect/:slug/resolve` — called server-side by the Next.js
 *     catch-all route. Visitor metadata is passed in the body because the
 *     frontend is the one that actually saw the visitor; a plain proxied
 *     request would attribute every click to the frontend container's IP.
 *
 *  2. `GET /api/v1/redirect/:slug` — a real 302, so the API works standalone
 *     (curl, tests, or pointing the short domain straight at the backend).
 */

import { Controller, Get, Param, Post, Body, Redirect, Req } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { extractClientIp, extractReferrerHost, extractUserAgent } from '../common/utils/request.util';
import { RedirectService } from './redirect.service';

/**
 * Visitor metadata forwarded by the frontend.
 *
 * Every field is untrusted and optional: a missing or forged value degrades
 * the analytics for that one row and can never break the redirect.
 */
export class ResolveSlugDto {
  /** Visitor's IP, as seen by the frontend. Hashed before storage. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ip?: string;

  /** Visitor's `User-Agent`. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string;

  /** Referring host. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  referrer?: string;
}

/** Response returned to the frontend's resolver. */
export class ResolvedLinkDto {
  /** Destination URL the visitor should be sent to. */
  targetUrl!: string;
}

@ApiTags('redirect')
@Controller('redirect')
/*
 * Redirects are exempt from application-level rate limiting. Two reasons, and
 * the first is a correctness bug rather than a preference:
 *
 *  1. `/resolve` is called server-to-server by the Next.js frontend, so every
 *     request carries the frontend container's IP. A per-IP limiter therefore
 *     sees ALL redirect traffic as one client and throttles every visitor once
 *     the bucket empties. (Observed in testing: with the global 100/min limit
 *     in place, most redirects returned 429 and their visits went unrecorded.)
 *
 *  2. Serving redirects is the product. A shortener is expected to handle click
 *     volume; the write paths — link creation and auth — are what an abuser
 *     targets, and those remain tightly limited. Flood protection for reads
 *     belongs at the CDN or WAF, which can see the real client.
 *
 * The lookup itself is a single indexed read, so the cost of an unthrottled
 * request is low.
 */
@SkipThrottle()
export class RedirectController {
  constructor(private readonly redirectService: RedirectService) {}

  /**
   * Resolves a slug and records the visit, returning the destination as JSON.
   *
   * @param slug Slug from the path.
   * @param dto  Visitor metadata captured by the frontend.
   * @returns The destination URL.
   */
  @Post(':slug/resolve')
  @ApiOperation({ summary: 'Resolve a slug and record a visit' })
  @ApiResponse({ status: 201, type: ResolvedLinkDto })
  @ApiResponse({ status: 404, description: 'Unknown, disabled or expired slug' })
  async resolve(
    @Param('slug') slug: string,
    @Body() dto: ResolveSlugDto,
  ): Promise<ResolvedLinkDto> {
    const link = await this.redirectService.resolve(slug, {
      ip: dto.ip,
      userAgent: dto.userAgent,
      referrer: dto.referrer,
    });
    return { targetUrl: link.targetUrl };
  }

  /**
   * Issues a real HTTP 302 to the destination.
   *
   * 302 (temporary) rather than 301 (permanent) is a deliberate choice: browsers
   * cache 301s aggressively and often indefinitely, which would both break slug
   * editing — the requirement that users can change a slug's destination — and
   * make visit counts wrong, since a cached redirect never reaches the server.
   *
   * @param slug    Slug from the path.
   * @param request Express request, used to capture visitor metadata.
   * @returns A Nest redirect descriptor.
   */
  @Get(':slug')
  @Redirect()
  @ApiExcludeEndpoint()
  async redirect(
    @Param('slug') slug: string,
    @Req() request: Request,
  ): Promise<{ url: string; statusCode: number }> {
    const link = await this.redirectService.resolve(slug, {
      ip: extractClientIp(request),
      userAgent: extractUserAgent(request),
      referrer: extractReferrerHost(request.headers.referer),
    });
    return { url: link.targetUrl, statusCode: 302 };
  }

  /**
   * Resolves a slug without counting a visit.
   *
   * @param slug Slug from the path.
   * @returns The destination URL.
   */
  @Get(':slug/peek')
  @ApiOperation({ summary: 'Resolve a slug without recording a visit' })
  async peek(@Param('slug') slug: string): Promise<ResolvedLinkDto> {
    const link = await this.redirectService.peek(slug);
    return { targetUrl: link.targetUrl };
  }
}
