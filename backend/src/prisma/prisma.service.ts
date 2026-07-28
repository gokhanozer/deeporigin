/**
 * Prisma client wrapped as an injectable Nest provider.
 *
 * Extending `PrismaClient` gives services the full, type-safe query API through
 * ordinary dependency injection, while the lifecycle hooks tie the database
 * connection to the Nest application lifecycle (so shutdown waits for in-flight
 * queries instead of severing the pool).
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      // Warnings and errors always; full query logging only when debugging.
      log:
        process.env.PRISMA_LOG_QUERIES === 'true'
          ? ['query', 'warn', 'error']
          : ['warn', 'error'],
    });
  }

  /** Opens the connection pool eagerly, so a bad `DATABASE_URL` fails at boot. */
  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to the database');
  }

  /** Drains and closes the connection pool during graceful shutdown. */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Disconnected from the database');
  }

  /**
   * Deletes all rows from every table. Test-support only.
   *
   * Guarded against running outside `NODE_ENV=test` — an accidental call in
   * production would be unrecoverable.
   *
   * @throws {Error} When invoked outside the test environment.
   */
  async truncateAll(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('truncateAll() may only be called in the test environment');
    }
    // Order matters: children before parents, to respect foreign keys.
    await this.visit.deleteMany();
    await this.link.deleteMany();
    await this.user.deleteMany();
  }
}
