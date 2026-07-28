/**
 * Visit recording.
 *
 * Isolated from the redirect controller so that "what we store about a visit"
 * is defined once and can be reused by any future entry point (a QR-code
 * scanner, an SDK, a bulk importer).
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { hashIp } from '../common/utils/request.util';
import { parseUserAgent } from '../common/utils/user-agent.util';

/** Raw, untrusted metadata describing a single redirect. */
export interface VisitMetadata {
  /** Client IP address, hashed before storage. */
  ip?: string | null;
  /** Raw `User-Agent` header. */
  userAgent?: string | null;
  /** Referring hostname, already reduced from the full `Referer` URL. */
  referrer?: string | null;
}

@Injectable()
export class VisitsService {
  private readonly logger = new Logger(VisitsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Records a redirect and bumps the link's denormalised counters.
   *
   * Both writes run inside one transaction so the counter can never drift from
   * the underlying event rows.
   *
   * Failures are swallowed by design: analytics must never break the redirect
   * itself. A visitor clicking a short link cares about reaching their
   * destination, not about our statistics — so a database hiccup degrades to a
   * missing data point, logged for us, invisible to them.
   *
   * @param linkId   ID of the link that was resolved.
   * @param metadata Request metadata captured at redirect time.
   */
  async recordVisit(linkId: string, metadata: VisitMetadata): Promise<void> {
    try {
      const { ipHashSalt } = this.config.get('privacy', { infer: true });
      const { browser, os, deviceType } = parseUserAgent(metadata.userAgent);
      const occurredAt = new Date();

      await this.prisma.$transaction([
        this.prisma.visit.create({
          data: {
            linkId,
            occurredAt,
            ipHash: metadata.ip ? hashIp(metadata.ip, ipHashSalt) : null,
            userAgent: metadata.userAgent ?? null,
            browser,
            os,
            deviceType,
            referrer: metadata.referrer ?? null,
          },
        }),
        this.prisma.link.update({
          where: { id: linkId },
          data: {
            // Atomic server-side increment — no read-modify-write race between
            // concurrent clicks on the same link.
            visitCount: { increment: 1 },
            lastVisitedAt: occurredAt,
          },
        }),
      ]);
    } catch (error) {
      this.logger.error(
        `Failed to record visit for link ${linkId}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Counts distinct visitors for a link, approximated by distinct IP hashes.
   *
   * @param linkId Link to measure.
   * @returns Number of distinct hashed IPs seen.
   */
  async countUniqueVisitors(linkId: string): Promise<number> {
    const rows = await this.prisma.visit.findMany({
      where: { linkId, ipHash: { not: null } },
      distinct: ['ipHash'],
      select: { ipHash: true },
    });
    return rows.length;
  }
}
