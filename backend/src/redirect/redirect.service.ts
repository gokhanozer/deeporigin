/**
 * Slug resolution — the hot path of the entire application.
 *
 * Every short-link click lands here, so this is the one place where read
 * performance genuinely matters: a single indexed lookup on the unique `slug`
 * column, with the (slower) visit write deliberately kept off the critical
 * path.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeSlug } from '../common/utils/slug.util';
import { isLinkResolvable } from '../links/links.mapper';
import { VisitsService, type VisitMetadata } from '../visits/visits.service';

/** Result of successfully resolving a slug. */
export interface ResolvedLink {
  /** ID of the resolved link. */
  id: string;
  /** Destination to redirect the visitor to. */
  targetUrl: string;
}

@Injectable()
export class RedirectService {
  private readonly logger = new Logger(RedirectService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly visits: VisitsService,
  ) {}

  /**
   * Resolves a slug to its destination and records the visit.
   *
   * The visit write is intentionally **not awaited**. Awaiting it would add a
   * database round-trip to every redirect, which users experience directly as
   * latency; fire-and-forget keeps the redirect fast, and `recordVisit` already
   * swallows its own errors so an unhandled rejection is impossible.
   *
   * (In a higher-volume deployment this is exactly where a queue — BullMQ,
   * SQS — would replace the floating promise. That trade-off is documented in
   * `docs/IMPLEMENTATION.md`.)
   *
   * @param rawSlug  Slug taken from the URL path.
   * @param metadata Visitor metadata to attribute the click to.
   * @returns The resolved link.
   * @throws {NotFoundException} When the slug is unknown, disabled or expired —
   *         which the frontend turns into the required 404 page.
   */
  async resolve(rawSlug: string, metadata: VisitMetadata = {}): Promise<ResolvedLink> {
    const slug = normalizeSlug(rawSlug);

    const link = await this.prisma.link.findUnique({
      where: { slug },
      select: { id: true, targetUrl: true, isActive: true, expiresAt: true },
    });

    // Unknown, disabled and expired links are all reported identically, so the
    // 404 page never has to explain *why* a link is unavailable.
    if (!link || !isLinkResolvable(link)) {
      throw new NotFoundException('This short link does not exist');
    }

    void this.visits.recordVisit(link.id, metadata);

    return { id: link.id, targetUrl: link.targetUrl };
  }

  /**
   * Resolves a slug without recording a visit.
   *
   * Used for previews and health checks, where counting a click would pollute
   * the analytics.
   *
   * @param rawSlug Slug to look up.
   * @returns The resolved link.
   * @throws {NotFoundException} When the slug cannot be resolved.
   */
  async peek(rawSlug: string): Promise<ResolvedLink> {
    const slug = normalizeSlug(rawSlug);
    const link = await this.prisma.link.findUnique({
      where: { slug },
      select: { id: true, targetUrl: true, isActive: true, expiresAt: true },
    });

    if (!link || !isLinkResolvable(link)) {
      throw new NotFoundException('This short link does not exist');
    }
    return { id: link.id, targetUrl: link.targetUrl };
  }
}
