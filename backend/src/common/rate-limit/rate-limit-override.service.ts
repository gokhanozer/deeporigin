/**
 * Runtime overrides for rate limits — the "feature flag" layer.
 *
 * ## Why this exists
 *
 * Rate limits are normally deploy-time configuration: `RATE_LIMIT_*` env vars,
 * baked into `@ThrottleAuth()` / `@ThrottleCreate()` at module load. That is the
 * right default — the values are version-controlled, reviewed, and reproducible.
 *
 * It is the wrong shape for exactly one situation: **an incident.** When an
 * endpoint is being scraped you want the limit tightened in seconds, and a
 * config change plus a rolling deploy is too slow. Equally, during a load test
 * you want limiting off for a few minutes without shipping anything.
 *
 * This service adds that escape hatch without disturbing the default path:
 *
 * ```
 * decorator value (from env)  ─┐
 *                              ├─▶  effective limit
 * Redis override (if present) ─┘     (override wins)
 * ```
 *
 * ## Operating it
 *
 * Overrides are plain Redis keys, so they can be set with `redis-cli` — no
 * admin API, no new authentication surface to secure:
 *
 * ```bash
 * # tighten link creation to 2/min during an incident
 * redis-cli SET ratelimit:override:create '{"limit":2}'
 *
 * # disable limiting on auth for a 10-minute load test (auto-expires)
 * redis-cli SET ratelimit:override:auth '{"disabled":true}' EX 600
 *
 * # revert to the configured value
 * redis-cli DEL ratelimit:override:create
 * ```
 *
 * Setting a TTL is strongly encouraged: an override that expires on its own
 * cannot be forgotten, which is the usual way emergency changes become
 * permanent.
 *
 * ## ⚠️ Loosening a limit does not un-block an already-blocked client
 *
 * `@nestjs/throttler` keeps two keys per bucket — `:hits` and `:blocked`. Once a
 * client exceeds the limit it enters the blocked state for `blockDuration`, and
 * that state is checked *independently* of the current limit. Raising the limit
 * or deleting the override therefore takes effect for the next window, but a
 * client already blocked stays blocked until its key expires.
 *
 * That is usually what you want when tightening. When you need someone unblocked
 * *now* — a paying customer caught by an over-aggressive emergency limit — the
 * counters must be cleared as well:
 *
 * ```bash
 * # inspect
 * redis-cli --scan --pattern '*default*'
 * # clear one bucket's state (verified: restores service immediately)
 * redis-cli --scan --pattern '*default*' | xargs redis-cli DEL
 * ```
 *
 * Clearing counters resets everyone's allowance for the current window, so it is
 * a blunt instrument — acceptable during an incident, not a routine operation.
 *
 * ## Design notes
 *
 * - **Cached in memory for {@link CACHE_TTL_MS}.** A Redis round-trip on every
 *   request would add latency to the hot path for a value that changes maybe
 *   twice a year. The cache bounds propagation delay to a few seconds, which is
 *   fast enough for incident response.
 * - **Fails open.** If Redis is unreachable the lookup returns `null` and the
 *   configured limit applies. An override system that can break rate limiting
 *   is worse than no override system.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

/** Named buckets that can be overridden. Mirrors the throttle decorators. */
export type RateLimitBucket = 'default' | 'auth' | 'create';

/** Shape stored in Redis, as JSON. Every field is optional. */
export interface RateLimitOverride {
  /** Replacement request allowance for the window. */
  limit?: number;
  /** Replacement window length, in milliseconds. */
  ttl?: number;
  /** When true, the bucket is not enforced at all. */
  disabled?: boolean;
}

/** Key prefix for override entries. */
const KEY_PREFIX = 'ratelimit:override:';

/**
 * How long a fetched override is trusted before Redis is consulted again.
 *
 * The trade: higher means less Redis traffic but slower propagation. Five
 * seconds keeps the per-request cost at effectively zero while still making an
 * emergency change take effect faster than a human can refresh a dashboard.
 */
const CACHE_TTL_MS = 5_000;

/** A cached lookup result, including negative results. */
interface CacheEntry {
  value: RateLimitOverride | null;
  expiresAt: number;
}

@Injectable()
export class RateLimitOverrideService {
  private readonly logger = new Logger(RateLimitOverrideService.name);
  private readonly cache = new Map<RateLimitBucket, CacheEntry>();

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis | null) {}

  /**
   * Resolves the active override for a bucket, if any.
   *
   * @param bucket Named bucket to look up.
   * @returns The override, or `null` when none is set (or Redis is unavailable).
   *
   * @example
   * const override = await service.resolve('create');
   * const limit = override?.limit ?? configuredLimit;
   */
  async resolve(bucket: RateLimitBucket): Promise<RateLimitOverride | null> {
    // No Redis configured: overrides are simply unavailable, which is a valid
    // single-instance mode rather than a failure.
    if (!this.redis) return null;

    const cached = this.cache.get(bucket);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    let value: RateLimitOverride | null = null;
    try {
      const raw = await this.redis.get(`${KEY_PREFIX}${bucket}`);
      value = raw ? this.parse(raw, bucket) : null;
    } catch (error) {
      // Fail open — see the class docstring. Cache the null so a Redis outage
      // does not produce a failed lookup on every single request.
      this.logger.error(
        `Could not read rate-limit override for "${bucket}": ${(error as Error).message}`,
      );
    }

    this.cache.set(bucket, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }

  /**
   * Parses and validates a stored override.
   *
   * Anything malformed is discarded rather than applied. A corrupt value must
   * never be able to set the limit to `NaN` or `0` and lock out all traffic.
   *
   * @param raw    Raw JSON string from Redis.
   * @param bucket Bucket name, for logging.
   * @returns The parsed override, or `null` if unusable.
   */
  private parse(raw: string, bucket: RateLimitBucket): RateLimitOverride | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.logger.warn(`Ignoring malformed rate-limit override for "${bucket}": ${raw}`);
      return null;
    }

    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;

    const override: RateLimitOverride = {};

    if (typeof candidate.limit === 'number' && Number.isFinite(candidate.limit) && candidate.limit > 0) {
      override.limit = Math.floor(candidate.limit);
    }
    if (typeof candidate.ttl === 'number' && Number.isFinite(candidate.ttl) && candidate.ttl > 0) {
      override.ttl = Math.floor(candidate.ttl);
    }
    if (typeof candidate.disabled === 'boolean') {
      override.disabled = candidate.disabled;
    }

    // An object with no usable fields is equivalent to no override.
    return Object.keys(override).length > 0 ? override : null;
  }

  /**
   * Clears the in-memory cache.
   *
   * Test-support, and useful if an override must take effect immediately rather
   * than within {@link CACHE_TTL_MS}.
   */
  clearCache(): void {
    this.cache.clear();
  }
}
