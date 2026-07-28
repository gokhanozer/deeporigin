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

import { Throttle } from '@nestjs/throttler';
import { configuration } from '../../config/configuration';

/** Rate-limit settings resolved once, at module load. */
const { rateLimit } = configuration();

/**
 * Strict limit for authentication endpoints.
 *
 * Login and registration are the classic brute-force targets, so they get the
 * smallest allowance in the application.
 *
 * @returns A method/class decorator applying the auth limit.
 */
export const ThrottleAuth = () =>
  Throttle({ default: { limit: rateLimit.authLimit, ttl: rateLimit.windowMs } });

/**
 * Tighter limit for link creation.
 *
 * This is the only anonymous endpoint that writes rows, making it the obvious
 * target for a spammer filling the database with junk links.
 *
 * @returns A method/class decorator applying the creation limit.
 */
export const ThrottleCreate = () =>
  Throttle({ default: { limit: rateLimit.createLimit, ttl: rateLimit.windowMs } });

/** The resolved limits, re-exported for logging and documentation. */
export const RATE_LIMITS = rateLimit;
