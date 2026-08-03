/**
 * Rate-limit bucket assignment for the auth routes.
 *
 * These are regression tests for a real bug: `@ThrottleAuth()` was originally
 * applied at controller level, which swept `GET /auth/me` into the 5/min
 * brute-force bucket. Because the frontend calls that endpoint on every page
 * load to restore the session, a user refreshing five or six times in a minute
 * exhausted the budget, received a `429`, and was signed out.
 *
 * The assertions below pin the *intent*: credential-guessing routes are
 * strictly limited, the authenticated read is not.
 */

import { Reflector } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { RATE_LIMIT_BUCKET } from '../common/decorators/throttle.decorators';

describe('AuthController rate-limit buckets', () => {
  const reflector = new Reflector();

  /**
   * Reads the bucket a route resolves to, mirroring how `ThrottlerProxyGuard`
   * does it: handler metadata wins over controller metadata.
   *
   * @param method Controller method name.
   * @returns The bucket name, defaulting to `'default'` when untagged.
   */
  function bucketFor(method: keyof AuthController): string {
    return (
      reflector.getAllAndOverride<string>(RATE_LIMIT_BUCKET, [
        AuthController.prototype[method] as unknown as () => unknown,
        AuthController,
      ]) ?? 'default'
    );
  }

  // NOTE: these assert on RATE_LIMIT_BUCKET rather than `@nestjs/throttler`'s
  // own metadata keys, which are not exported from the package root. Since
  // `@ThrottleAuth()` applies `Throttle(...)` and the bucket tag together via
  // `applyDecorators`, the tag is a faithful proxy for "this route is strictly
  // limited" — and it is the value the guard actually reads. The resulting
  // numeric limits are verified end-to-end against the running stack.

  describe('credential-guessing routes are strictly limited', () => {
    it.each(['register', 'login'] as const)('%s uses the auth bucket', (method) => {
      expect(bucketFor(method)).toBe('auth');
    });
  });

  describe('the authenticated read is not', () => {
    it('getProfile falls through to the default bucket', () => {
      // GET /auth/me proves an EXISTING token; it is not an attempt to obtain
      // one. Putting it in the brute-force bucket signs users out merely for
      // refreshing the page.
      expect(bucketFor('getProfile')).toBe('default');
    });
  });

  it('the controller itself is untagged, so nothing is swept in by default', () => {
    // The original bug was a controller-level @ThrottleAuth(). Guard against
    // it returning: adding a route here must be a deliberate choice.
    expect(reflector.get(RATE_LIMIT_BUCKET, AuthController)).toBeUndefined();
  });
});
