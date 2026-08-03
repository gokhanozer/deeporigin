/**
 * Named rate-limit decorators.
 *
 * `@nestjs/throttler` evaluates `@Throttle()` at class-definition time, which is
 * before Nest's DI container exists — so `ConfigService` cannot be injected
 * here. The limits are therefore read straight from the environment through the
 * same {@link configuration} factory the rest of the app uses, keeping one
 * source of truth without needing DI.
 *
 * A deliberate note on design: only a **single** `default` throttler is
 * registered globally. `@nestjs/throttler` v6 evaluates *every* named throttler
 * against *every* route, so registering `default`, `create` and `auth` side by
 * side would silently apply the strictest of the three everywhere. Overriding
 * the one `default` bucket per-route is the correct way to express
 * "most endpoints are generous, these few are strict".
 */

import { applyDecorators, SetMetadata } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { configuration } from '../../config/configuration';
import type { RateLimitBucket } from '../rate-limit/rate-limit-override.service';

/** Rate-limit settings resolved once, at module load. */
const { rateLimit } = configuration();

/**
 * Metadata key carrying the bucket name a route belongs to.
 *
 * The decorator's numeric values are frozen into class metadata at module load
 * and cannot change afterwards. Tagging the route with a *name* is what lets
 * {@link ThrottlerProxyGuard} look up a runtime override for it — the name is
 * stable, the numbers behind it are not.
 */
export const RATE_LIMIT_BUCKET = 'rate-limit-bucket';

/**
 * Tags a route or controller with a named rate-limit bucket.
 *
 * @param bucket Bucket name that overrides can target.
 * @returns A decorator attaching the metadata.
 */
export const RateLimitBucketTag = (bucket: RateLimitBucket) =>
  SetMetadata(RATE_LIMIT_BUCKET, bucket);

/**
 * Strict limit for authentication endpoints.
 *
 * Login and registration are the classic brute-force targets, so they get the
 * smallest allowance in the application.
 *
 * @returns A method/class decorator applying the auth limit.
 */
export const ThrottleAuth = () =>
  applyDecorators(
    Throttle({ default: { limit: rateLimit.authLimit, ttl: rateLimit.windowMs } }),
    RateLimitBucketTag('auth'),
  );

/**
 * Tighter limit for link creation.
 *
 * This is the only anonymous endpoint that writes rows, making it the obvious
 * target for a spammer filling the database with junk links.
 *
 * @returns A method/class decorator applying the creation limit.
 */
export const ThrottleCreate = () =>
  applyDecorators(
    Throttle({ default: { limit: rateLimit.createLimit, ttl: rateLimit.windowMs } }),
    RateLimitBucketTag('create'),
  );

/** The resolved limits, re-exported for logging and documentation. */
export const RATE_LIMITS = rateLimit;
