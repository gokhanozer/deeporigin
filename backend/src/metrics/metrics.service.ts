/**
 * Prometheus metrics registry and the application's custom instruments.
 *
 * Exposes what an operator needs to answer three questions at 3am:
 * **is it up, is it fast, is it being abused?**
 *
 * ## The cardinality rule — the one that matters
 *
 * Every distinct combination of label values becomes its own time series.
 * Labelling by anything unbounded — a slug, a user ID, an IP, a raw URL path —
 * grows the series count without limit until Prometheus exhausts memory. This is
 * the single most common way a Prometheus deployment is killed.
 *
 * So labels here are strictly **low-cardinality enumerations**: a route
 * *template* (`/links/:id`, never `/links/abc-123`), an HTTP method, a status
 * class, a rate-limit bucket name. If a label's possible values cannot be
 * written on one line, it does not belong in a metric.
 *
 * High-cardinality detail belongs in logs, or in the `visits` table — which is
 * exactly where per-link analytics already live.
 */

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';
import { PrismaService } from '../prisma/prisma.service';

/** How a redirect attempt ended. A closed set, so safe as a label. */
export type RedirectResult = 'hit' | 'not_found';

/** Whether a created link used a generated or user-supplied slug. */
export type SlugType = 'generated' | 'custom';

/**
 * Latency buckets, in seconds.
 *
 * The library default is tuned for second-scale work and would put every
 * redirect in the lowest bucket, reporting nothing useful. These span 1ms to 1s,
 * which is the range this app actually operates in.
 */
const LATENCY_BUCKETS = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1];

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly logger = new Logger(MetricsService.name);

  /**
   * A dedicated registry rather than the global default.
   *
   * Keeps the app's metrics isolated from anything a dependency might register,
   * and lets tests build a clean instance without cross-contamination.
   */
  readonly registry = new Registry();

  /** Duration of every HTTP request, by route template. */
  readonly httpDuration: Histogram<'method' | 'route' | 'status'>;

  /** Redirect outcomes — the hot path, tracked separately from general HTTP. */
  readonly redirectTotal: Counter<'result'>;

  /** Redirect latency. What a user actually feels when clicking a short link. */
  readonly redirectDuration: Histogram<'result'>;

  /** Links created, split by how the slug was chosen. */
  readonly linkCreatedTotal: Counter<'slug_type'>;

  /**
   * Generated-slug collisions.
   *
   * Rises as the keyspace fills. A sustained non-zero rate is the signal to
   * raise `SLUG_LENGTH` — otherwise invisible until creation starts failing.
   */
  readonly slugCollisionTotal: Counter<string>;

  /** Requests rejected by the rate limiter, by bucket. */
  readonly rateLimitRejectedTotal: Counter<'bucket'>;

  /**
   * Visit writes that failed.
   *
   * `recordVisit` is deliberately fire-and-forget so analytics never add latency
   * to a redirect — which also means a failure is completely silent today. This
   * counter is the only way to see it.
   */
  readonly visitRecordFailedTotal: Counter<string>;

  constructor(private readonly prisma: PrismaService) {
    // Process-level metrics: CPU, memory, GC, and event-loop lag — the last of
    // which is the single most useful Node health signal.
    collectDefaultMetrics({ register: this.registry, prefix: 'shortener_' });

    this.httpDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request latency by route template',
      // `route` is the Nest path pattern, never the resolved URL — see the
      // cardinality note in this file's header.
      labelNames: ['method', 'route', 'status'] as const,
      buckets: LATENCY_BUCKETS,
      registers: [this.registry],
    });

    this.redirectTotal = new Counter({
      name: 'shortener_redirect_total',
      help: 'Short-link resolutions by outcome',
      labelNames: ['result'] as const,
      registers: [this.registry],
    });

    this.redirectDuration = new Histogram({
      name: 'shortener_redirect_duration_seconds',
      help: 'Time to resolve a slug to its destination',
      labelNames: ['result'] as const,
      buckets: LATENCY_BUCKETS,
      registers: [this.registry],
    });

    this.linkCreatedTotal = new Counter({
      name: 'shortener_link_created_total',
      help: 'Short links created',
      labelNames: ['slug_type'] as const,
      registers: [this.registry],
    });

    this.slugCollisionTotal = new Counter({
      name: 'shortener_slug_collision_total',
      help: 'Generated slugs that collided and were retried',
      registers: [this.registry],
    });

    this.rateLimitRejectedTotal = new Counter({
      name: 'shortener_rate_limit_rejected_total',
      help: 'Requests rejected with 429, by rate-limit bucket',
      labelNames: ['bucket'] as const,
      registers: [this.registry],
    });

    this.visitRecordFailedTotal = new Counter({
      name: 'shortener_visit_record_failed_total',
      help: 'Visit writes that failed after a successful redirect',
      registers: [this.registry],
    });
  }

  /** Logs the instrument count once, so a misconfigured registry is obvious. */
  async onModuleInit(): Promise<void> {
    const count = (await this.registry.getMetricsAsJSON()).length;
    this.logger.log(`Prometheus registry ready with ${count} metrics`);
  }

  /**
   * Renders the full exposition, including Prisma's own pool metrics.
   *
   * Prisma exports Prometheus-formatted text directly, so connection-pool
   * saturation — the failure mode PgBouncer exists to prevent — comes for free
   * rather than needing to be instrumented by hand.
   *
   * @returns Prometheus text-format exposition.
   */
  async render(): Promise<string> {
    const appMetrics = await this.registry.metrics();

    let prismaMetrics = '';
    try {
      prismaMetrics = await this.prisma.$metrics.prometheus();
    } catch (error) {
      // Requires the `metrics` preview feature. Its absence must not break the
      // whole endpoint — the app's own metrics are still worth serving.
      this.logger.debug(`Prisma metrics unavailable: ${(error as Error).message}`);
    }

    return `${appMetrics}\n${prismaMetrics}`;
  }

  /**
   * Records a completed redirect.
   *
   * @param result     Outcome of the resolution.
   * @param startedAt  `process.hrtime.bigint()` taken when handling began.
   */
  observeRedirect(result: RedirectResult, startedAt: bigint): void {
    const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
    this.redirectTotal.inc({ result });
    this.redirectDuration.observe({ result }, seconds);
  }
}
