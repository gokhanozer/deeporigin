/**
 * Proxy-aware rate-limiting guard, with runtime overrides.
 *
 * Two responsibilities beyond the stock `ThrottlerGuard`:
 *
 * 1. **Correct client identity.** The stock guard keys its buckets on `req.ip`,
 *    which behind nginx, a load balancer or Docker's userland proxy is the
 *    *proxy's* address — so every visitor would share one bucket. A single busy
 *    user would rate-limit the entire internet, and an attacker would still get
 *    the full allowance per container.
 *
 * 2. **Runtime overrides.** Per-route limits are frozen into class metadata when
 *    the decorators are evaluated at module load, so they cannot be changed
 *    without a restart. This guard consults {@link RateLimitOverrideService} on
 *    each request and substitutes the effective values — the escape hatch for
 *    incidents and load tests.
 */

import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { ThrottlerRequest } from '@nestjs/throttler/dist/throttler.guard.interface';
import type { Request } from 'express';
import { extractClientIp } from '../utils/request.util';
import { RATE_LIMIT_BUCKET } from '../decorators/throttle.decorators';
import {
  RateLimitOverrideService,
  type RateLimitBucket,
} from '../rate-limit/rate-limit-override.service';
import { MetricsService } from '../../metrics/metrics.service';

@Injectable()
export class ThrottlerProxyGuard extends ThrottlerGuard {
  /**
   * @param options        Throttler module options (injected by token).
   * @param storageService Counter storage — Redis or in-memory (injected by token).
   * @param reflector      Reads the bucket metadata off the handler.
   * @param overrides      Runtime override lookup.
   */
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly overrides: RateLimitOverrideService,
    private readonly metrics: MetricsService,
  ) {
    // The parent's first two parameters are injected by token rather than by
    // type, so they must be re-declared here and forwarded explicitly.
    super(options, storageService, reflector);
  }

  /**
   * Produces the bucket key for a request.
   *
   * Authenticated requests are keyed by user ID so that several colleagues
   * behind one office NAT are not throttled as a single client; anonymous
   * requests fall back to the resolved client IP.
   *
   * @param request Inbound Express request.
   * @returns A stable identifier for the caller.
   */
  protected async getTracker(request: Request): Promise<string> {
    const user = (request as Request & { user?: { id?: string } }).user;
    if (user?.id) return `user:${user.id}`;
    return `ip:${extractClientIp(request)}`;
  }

  /**
   * Applies any runtime override before delegating to the standard check.
   *
   * @param requestProps Limit, TTL and context resolved from the decorators.
   * @returns `true` when the request may proceed.
   */
  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const bucket = this.resolveBucket(requestProps.context);
    const override = await this.overrides.resolve(bucket);

    // Kill switch: skip enforcement entirely for this bucket.
    if (override?.disabled) return true;

    if (!override || (override.limit === undefined && override.ttl === undefined)) {
      // Common case — no override. Delegate untouched, so behaviour is
      // identical to the stock guard when the feature is unused.
      return super.handleRequest(requestProps);
    }

    return super.handleRequest({
      ...requestProps,
      limit: override.limit ?? requestProps.limit,
      ttl: override.ttl ?? requestProps.ttl,
    });
  }

  /**
   * Records the rejection before raising the 429.
   *
   * Counting here rather than at the HTTP layer keeps the bucket name attached,
   * which is what makes the metric actionable: "we are shedding auth traffic"
   * is a different incident from "we are shedding link creations".
   *
   * @param context             Current execution context.
   * @param throttlerLimitDetail Detail supplied by the base guard.
   */
  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: Parameters<ThrottlerGuard['throwThrottlingException']>[1],
  ): Promise<void> {
    this.metrics.rateLimitRejectedTotal.inc({ bucket: this.resolveBucket(context) });
    return super.throwThrottlingException(context, throttlerLimitDetail);
  }

  /**
   * Reads the bucket name a route was tagged with.
   *
   * Handler metadata wins over controller metadata, so an individual route can
   * opt into a different bucket than its controller.
   *
   * @param context Current execution context.
   * @returns The tagged bucket, or `'default'` when untagged.
   */
  private resolveBucket(context: ExecutionContext): RateLimitBucket {
    return (
      this.reflector.getAllAndOverride<RateLimitBucket>(RATE_LIMIT_BUCKET, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'default'
    );
  }
}
