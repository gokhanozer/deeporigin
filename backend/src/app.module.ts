/**
 * Root application module.
 *
 * Composes the feature modules and installs the four application-wide
 * behaviours: configuration, rate limiting, request logging and error
 * normalisation. Registering these here (rather than per controller) is what
 * keeps the feature modules free of cross-cutting boilerplate.
 */

import { Logger, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, type ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
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
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const { windowMs, limit } = config.get('rateLimit', { infer: true });
        const redisUrl = config.get('redis', { infer: true }).url;

        return {
          throttlers: [{ name: 'default', ttl: windowMs, limit }],
          ...(redisUrl ? { storage: createRedisThrottlerStorage(redisUrl) } : {}),
        };
      },
    }),

    // ---- Infrastructure ----------------------------------------------------
    PrismaModule,

    // ---- Features ----------------------------------------------------------
    AuthModule,
    LinksModule,
    VisitsModule,
    RedirectModule,
    AnalyticsModule,
    HealthModule,
  ],
  providers: [
    // Rate limiting applies to every route by default; the proxy-aware subclass
    // ensures buckets are keyed on the real client rather than on a proxy.
    { provide: APP_GUARD, useClass: ThrottlerProxyGuard },
    // One uniform error envelope for the whole API.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Consistent access logs with timing.
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}

/**
 * Builds the Redis-backed throttler storage.
 *
 * **Failure policy — fail open, loudly.** If Redis becomes unreachable, the
 * guard's storage calls reject and `ThrottlerGuard` lets the request through
 * rather than rejecting it. That is the deliberate choice for a URL shortener:
 * losing rate limiting is bad, but refusing *all* traffic because a limiter is
 * down is worse. The errors are logged at `error` level so the condition is
 * alertable rather than silent.
 *
 * `maxRetriesPerRequest: 1` and a short timeout keep a Redis outage from adding
 * seconds of latency to every request while ioredis retries.
 *
 * @param url Redis connection string, e.g. `redis://redis:6379`.
 * @returns Storage shared by every backend replica.
 */
function createRedisThrottlerStorage(url: string): ThrottlerStorage {
  const logger = new Logger('ThrottlerStorage');

  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
    // Retry with backoff, but give up quickly per attempt so requests are not
    // held hostage by a dead Redis.
    retryStrategy: (attempt) => Math.min(attempt * 200, 2_000),
    lazyConnect: false,
  });

  client.on('error', (error: Error) => {
    // ioredis emits on every reconnection attempt; log rather than throw, or an
    // unhandled 'error' event would take the process down.
    logger.error(`Redis unavailable — rate limits are not shared: ${error.message}`);
  });

  client.on('ready', () => {
    logger.log('Connected to Redis — rate limits are shared across replicas');
  });

  return new ThrottlerStorageRedisService(client);
}
