/**
 * Authentication guards.
 *
 * Two variants are exported because the app has two distinct access patterns:
 *
 *  • {@link JwtAuthGuard}         — hard requirement. Used on `/links/mine`
 *                                   and every dashboard endpoint.
 *  • {@link OptionalJwtAuthGuard} — best-effort. Used on `POST /links`, so an
 *                                   anonymous visitor can still shorten a URL
 *                                   (as in the mock-up) while a signed-in user
 *                                   automatically gets ownership of the link.
 */

import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { JwtUser } from '../../common/decorators/current-user.decorator';

/**
 * Rejects the request with `401` unless a valid bearer token is present.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

/**
 * Populates `request.user` when a valid token is present, and does nothing
 * otherwise. Never rejects the request.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  /**
   * Overrides Passport's default "no user ⇒ throw" behaviour.
   *
   * @param _error Authentication error, ignored on purpose.
   * @param user   The principal Passport resolved, or `false` when absent/invalid.
   * @returns The user when authenticated, otherwise `undefined`.
   */
  handleRequest<TUser = JwtUser | undefined>(_error: unknown, user: unknown): TUser {
    // An invalid or expired token is treated exactly like no token at all:
    // the request proceeds anonymously rather than failing.
    return (user || undefined) as TUser;
  }

  /**
   * Always allows the request through, after letting Passport attempt to
   * resolve a user.
   *
   * @param context Current execution context.
   * @returns Always `true`.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    return true;
  }
}
