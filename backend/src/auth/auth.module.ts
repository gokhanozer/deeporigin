/**
 * Wires up JWT authentication.
 *
 * Exports `JwtStrategy` and the Passport module so that other feature modules
 * (notably `LinksModule`, which uses the optional guard) can authenticate
 * requests without redefining the strategy.
 */

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { AppConfig } from '../config/configuration';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // Registered asynchronously so the signing secret comes from validated
    // configuration rather than being read from process.env at import time.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const auth = config.get('auth', { infer: true });
        return {
          secret: auth.jwtSecret,
          signOptions: {
            // `expiresIn` is typed as a template-literal union by `ms` (e.g.
            // '7d' | '1h' | …). Our value arrives from the environment as a
            // plain string, so the cast asserts what validation guarantees.
            expiresIn: auth.jwtExpiresIn as JwtSignOptions['expiresIn'],
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
