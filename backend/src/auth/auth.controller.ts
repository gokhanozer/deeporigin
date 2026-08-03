/**
 * Authentication endpoints.
 *
 * Rate limiting is applied **per route**, not to the controller, and the
 * distinction matters:
 *
 *  • `register` and `login` each carry the strictest limit in the application
 *    (`@ThrottleAuth()`). Every request is a guess at a secret, so being too
 *    permissive risks account takeover — and bcrypt makes each attempt costly
 *    server-side, so unlimited attempts are also a CPU-exhaustion vector.
 *
 *  • `me` deliberately does NOT. It is an authenticated read that proves an
 *    existing token, not an attempt to obtain one, so it belongs in the default
 *    bucket alongside other reads.
 *
 * Applying `@ThrottleAuth()` at controller level — as this originally did —
 * swept `me` into the brute-force bucket. Because the frontend calls it on every
 * page load to restore the session, a user refreshing five or six times in a
 * minute exhausted the budget and was signed out. See the matching fix in
 * `frontend/src/providers/AuthProvider.tsx`.
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
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Creates a new account.
   *
   * @param dto Registration payload.
   * @returns Access token and the created user.
   */
  @Post('register')
  @ThrottleAuth()
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
  @ThrottleAuth()
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
