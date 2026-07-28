/**
 * Authentication endpoints.
 *
 * All routes here carry the strictest rate limit in the application: auth is
 * the prime target for credential-stuffing, and a slow brute-force is far more
 * damaging than a slow link-shortening request.
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ThrottleAuth } from '../common/decorators/throttle.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { AuthResponseDto, LoginDto, RegisterDto, UserDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
// Applies the strict auth rate limit to every route in this controller.
@ThrottleAuth()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Creates a new account.
   *
   * @param dto Registration payload.
   * @returns Access token and the created user.
   */
  @Post('register')
  @ApiOperation({ summary: 'Create an account' })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  /**
   * Exchanges credentials for an access token.
   *
   * Returns `200` rather than Nest's default `201`, since logging in creates
   * no server-side resource.
   *
   * @param dto Login payload.
   * @returns Access token and the user.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in and receive an access token' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  /**
   * Returns the currently authenticated user.
   *
   * Used by the frontend on boot to restore a session from a stored token.
   *
   * @param userId Injected from the validated JWT.
   * @returns The user's public profile.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated user' })
  @ApiResponse({ status: 200, type: UserDto })
  getProfile(@CurrentUser('id') userId: string): Promise<UserDto> {
    return this.authService.getProfile(userId);
  }
}
