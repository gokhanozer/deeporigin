/**
 * Shared Redis connection.
 *
 * One client is created for the whole process and reused by everything that
 * needs Redis — currently the throttler's counter storage and the rate-limit
 * override service. Opening a second connection per consumer would waste file
 * descriptors and make connection state harder to reason about.
 *
 * The provider resolves to `null` when `REDIS_URL` is unset. Consumers must
 * handle that: it is the supported single-instance / local-development mode,
 * not an error.
 */

import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { AppConfig } from '../../config/configuration';

/** Injection token for the shared client. Resolves to `Redis | null`. */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * Creates the shared ioredis client, or `null` when Redis is not configured.
 *
 * Connection options are tuned so that an unreachable Redis degrades quickly
 * rather than adding seconds of latency to every request while ioredis retries.
 *
 * @param url Redis connection string.
 * @returns A connected client.
 */
function createClient(url: string): Redis {
  const logger = new Logger('Redis');

  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
    retryStrategy: (attempt) => Math.min(attempt * 200, 2_000),
  });

  // ioredis emits 'error' on every reconnection attempt. Logging rather than
  // rethrowing matters: an unhandled 'error' event would terminate the process.
  client.on('error', (error: Error) => {
    logger.error(`Redis unavailable: ${error.message}`);
  });
  client.on('ready', () => logger.log('Redis connection ready'));

  return client;
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>): Redis | null => {
        const url = config.get('redis', { infer: true }).url;
        return url ? createClient(url) : null;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis | null) {}

  /**
   * Closes the connection during graceful shutdown, so Redis is not left
   * holding a half-open socket until its own timeout expires.
   */
  async onApplicationShutdown(): Promise<void> {
    // `quit()` drains pending commands first; `disconnect()` would drop them.
    await this.client?.quit().catch(() => undefined);
  }
}
