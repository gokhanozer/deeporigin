/**
 * Registration, login and token issuance.
 */

import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { AuthResponseDto, LoginDto, RegisterDto, UserDto } from './dto/auth.dto';
import type { JwtPayload } from './strategies/jwt.strategy';
import { hashPassword, normalizeEmail, verifyPassword } from './utils/password.util';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Creates an account and returns a session token.
   *
   * @param dto Validated registration payload.
   * @returns An access token plus the new user.
   * @throws {ConflictException} When the email is already registered.
   */
  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const email = normalizeEmail(dto.email);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Note: this deliberately reveals that an account exists. For a URL
      // shortener the usability win outweighs the enumeration risk; a bank
      // would instead send a "check your email" response either way.
      throw new ConflictException('An account with this email already exists');
    }

    const { bcryptRounds } = this.config.get('auth', { infer: true });
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(dto.password, bcryptRounds),
        displayName: dto.displayName?.trim() || null,
      },
    });

    this.logger.log(`Registered new user ${user.id}`);
    return this.buildAuthResponse(user);
  }

  /**
   * Authenticates an existing account.
   *
   * The same generic message is returned for "unknown email" and "wrong
   * password", so the endpoint cannot be used to enumerate valid accounts. A
   * dummy hash comparison runs when the user is missing, which keeps the
   * response time roughly constant and closes the timing side-channel.
   *
   * @param dto Validated login payload.
   * @returns An access token plus the user.
   * @throws {UnauthorizedException} When the credentials do not match.
   */
  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const email = normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Constant-time-ish: spend the same bcrypt cost as a real comparison.
      await verifyPassword(dto.password, DUMMY_BCRYPT_HASH).catch(() => false);
      throw new UnauthorizedException('Invalid email or password');
    }

    const matches = await verifyPassword(dto.password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.buildAuthResponse(user);
  }

  /**
   * Loads the current user's public profile.
   *
   * @param userId Authenticated user's ID.
   * @returns The user profile.
   * @throws {UnauthorizedException} When the account has since been deleted.
   */
  async getProfile(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Account no longer exists');
    return toUserDto(user);
  }

  /**
   * Signs a JWT and packages it with the public user profile.
   *
   * @param user Persisted user record.
   * @returns The auth response sent to the client.
   */
  private buildAuthResponse(user: User): AuthResponseDto {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return {
      accessToken: this.jwt.sign(payload),
      user: toUserDto(user),
    };
  }
}

/**
 * A syntactically valid bcrypt hash of a random string.
 *
 * Compared against when a login targets an unknown email, purely so that the
 * failure path costs the same wall-clock time as a genuine mismatch.
 */
const DUMMY_BCRYPT_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

/**
 * Strips sensitive columns from a user row.
 *
 * The one place a `User` becomes API-visible, so `passwordHash` cannot leak
 * through an endpoint that forgot to `select`.
 *
 * @param user Full database row.
 * @returns The public projection.
 */
export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
  };
}
