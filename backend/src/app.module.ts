/**
 * Root application module.
 *
 * Composes the feature modules and installs the four application-wide
 * behaviours: configuration, rate limiting, request logging and error
 * normalisation. Registering these here (rather than per controller) is what
 * keeps the feature modules free of cross-cutting boilerplate.
 */

import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import type Redis from 'ioredis';
import { RedisModule, REDIS_CLIENT } from './common/redis/redis.module';
import { RateLimitOverrideService } from './common/rate-limit/rate-limit-override.service';
import { MetricsModule } from './metrics/metrics.module';
import { MetricsInterceptor } from './metrics/metrics.interceptor';
import { AppController } from './app.controller';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ThrottlerProxyGuard } from './common/guards/throttler-proxy.guard';
import { configuration, type AppConfig } from './config/configuration';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { LinksModule } from './links/links.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedirectModule } from './redirect/redirect.module';
import { VisitsModule } from './visits/visits.module';

@Module({
  imports: [
    // ---- Configuration -----------------------------------------------------
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
      cache: true,
    }),

    // ---- Rate limiting -----------------------------------------------------
    // A single `default` bucket is registered; stricter endpoints override it
    // with @ThrottleAuth() / @ThrottleCreate(). See throttle.decorators.ts for
    // why multiple named throttlers would be a trap here.
    //
    // Storage is chosen at boot:
    //
    //   REDIS_URL set   → counters shared by every replica. REQUIRED when
    //                     running more than one backend instance: the default
    //                     in-memory store gives each replica its own counters,
    //                     so an N-replica deployment silently allows N× the
    //                     configured limit.
    //   REDIS_URL unset → in-memory. Correct for a single instance, and keeps
    //                     local development and the test suite dependency-free.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, REDIS_CLIENT],
      useFactory: (config: ConfigService<AppConfig, true>, redis: Redis | null) => {
        const { windowMs, limit } = config.get('rateLimit', { infer: true });

        return {
          throttlers: [{ name: 'default', ttl: windowMs, limit }],
          // Reuses the shared client from RedisModule rather than opening a
          // second connection.
          ...(redis ? { storage: new ThrottlerStorageRedisService(redis) } : {}),
        };
      },
    }),

    // ---- Infrastructure ----------------------------------------------------
    PrismaModule,
    RedisModule,
    MetricsModule,

    // ---- Features ----------------------------------------------------------
    AuthModule,
    LinksModule,
    VisitsModule,
    RedirectModule,
    AnalyticsModule,
    HealthModule,
  ],
  // The service index lives at the API prefix itself, so it belongs to the root
  // module rather than to any feature module.
  controllers: [AppController],
  providers: [
    // Resolves runtime rate-limit overrides from Redis. Injected into the guard.
    RateLimitOverrideService,
    // Rate limiting applies to every route by default; the proxy-aware subclass
    // keys buckets on the real client rather than on a proxy, and applies any
    // runtime override on top of the decorator's configured values.
    { provide: APP_GUARD, useClass: ThrottlerProxyGuard },
    // One uniform error envelope for the whole API.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Consistent access logs with timing.
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    // Request timings recorded against route templates for Prometheus.
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class AppModule {}
