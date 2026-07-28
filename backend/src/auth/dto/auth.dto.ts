/**
 * Request and response DTOs for the auth endpoints.
 *
 * The `class-validator` decorators are the single source of truth for what the
 * API accepts: Nest's global `ValidationPipe` enforces them before a controller
 * ever runs, and the Swagger plugin turns the same metadata into API docs.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../utils/password.util';

/** Payload for `POST /auth/register`. */
export class RegisterDto {
  /** Email address; normalised to lower-case before validation. */
  @ApiProperty({ example: 'ada@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(255)
  email!: string;

  /** Plaintext password. Hashed with bcrypt before it is ever persisted. */
  @ApiProperty({ minLength: MIN_PASSWORD_LENGTH, example: 'correct-horse-battery' })
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
  })
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string;

  /** Optional display name shown in the UI. */
  @ApiPropertyOptional({ example: 'Ada Lovelace' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  displayName?: string;
}

/** Payload for `POST /auth/login`. */
export class LoginDto {
  @ApiProperty({ example: 'ada@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'Password is required' })
  password!: string;
}

/** Public representation of a user. Never contains the password hash. */
export class UserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ nullable: true })
  displayName!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

/** Response returned by both register and login. */
export class AuthResponseDto {
  /** Signed JWT to be sent as `Authorization: Bearer <token>`. */
  @ApiProperty()
  accessToken!: string;

  /** The authenticated user. */
  @ApiProperty({ type: UserDto })
  user!: UserDto;
}
