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
 *  • {@link LinkOwnerAuthGuard}   — as `JwtAuthGuard`, but explains what to do
 *                                   instead. Used on the link mutations.
 */

import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { JwtUser } from '../../common/decorators/current-user.decorator';

/**
 * Rejects the request with `401` unless a valid bearer token is present.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

/**
 * As {@link JwtAuthGuard}, but with a message aimed at the person reading it.
 *
 * Editing a link requires owning it, and ownership only exists for signed-in
 * users — an anonymous link has `ownerId = null`, so nobody can claim it, not
 * even whoever created it. A bare `401 Unauthorized` states the rule without
 * saying what to do about it, so this names the alternative: shorten the URL
 * again to get a link of your own.
 *
 * Scoped to the link mutations rather than applied to {@link JwtAuthGuard}
 * itself, because the same guard protects `GET /auth/me`, where a message about
 * editing URLs would be nonsense.
 */
@Injectable()
export class LinkOwnerAuthGuard extends AuthGuard('jwt') {
  /**
   * Replaces Passport's generic rejection with an actionable one.
   *
   * @param error Authentication error, if Passport raised one.
   * @param user  The principal Passport resolved, or `false` when absent.
   * @returns The authenticated user.
   * @throws {UnauthorizedException} When no valid token was presented.
   */
  handleRequest<TUser = JwtUser>(error: unknown, user: unknown): TUser {
    if (error || !user) {
      throw new UnauthorizedException(
        "Anonymous users can't edit existing URLs — create a new one instead.",
      );
    }
    return user as TUser;
  }
}

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
