/**
 * Parameter decorator exposing the authenticated user to a route handler.
 *
 * Turns `@Req() req` + `req.user as JwtUser` (untyped, repeated everywhere)
 * into a single typed `@CurrentUser() user: JwtUser` parameter.
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** The authenticated principal attached to the request by the JWT strategy. */
export interface JwtUser {
  /** User's UUID primary key. */
  id: string;
  /** User's email address. */
  email: string;
}

/** Express request augmented with the authenticated principal. */
export interface AuthenticatedRequest extends Request {
  user?: JwtUser;
}

/**
 * Injects the current user, or `undefined` on optionally-authenticated routes.
 *
 * @example
 * // Whole user (undefined when anonymous):
 * findMine(@CurrentUser() user?: JwtUser) {}
 *
 * // A single property:
 * findMine(@CurrentUser('id') userId: string) {}
 */
export const CurrentUser = createParamDecorator(
  (property: keyof JwtUser | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) return undefined;
    return property ? user[property] : user;
  },
);
