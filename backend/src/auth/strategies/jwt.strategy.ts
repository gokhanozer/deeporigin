/**
 * Passport JWT strategy.
 *
 * Validates the `Authorization: Bearer <token>` header on protected routes and
 * attaches the decoded principal to `request.user`, where
 * `@CurrentUser()` picks it up.
 */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AppConfig } from '../../config/configuration';
import type { JwtUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

/** Claims we encode into the token. */
export interface JwtPayload {
  /** Subject — the user's UUID. */
  sub: string;
  /** The user's email, denormalised into the token to save a lookup. */
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // Expiry is enforced by passport-jwt rather than by us.
      ignoreExpiration: false,
      secretOrKey: config.get('auth', { infer: true }).jwtSecret,
    });
  }

  /**
   * Called by Passport once the token's signature and expiry check out.
   *
   * We re-read the user from the database rather than trusting the token alone,
   * so a deleted account cannot keep authenticating until its token expires.
   *
   * @param payload Decoded JWT claims.
   * @returns The principal attached to `request.user`.
   * @throws {UnauthorizedException} When the user no longer exists.
   */
  async validate(payload: JwtPayload): Promise<JwtUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true },
    });

    if (!user) {
      throw new UnauthorizedException('Account no longer exists');
    }

    return { id: user.id, email: user.email };
  }
}
