/**
 * Liveness and readiness probes.
 *
 * `docker-compose` uses these to gate service start-up ordering, so the
 * frontend never boots against a backend whose database is not yet reachable.
 */

import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';

/** Payload returned by the health endpoints. */
export interface HealthStatus {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  timestamp: string;
  database?: 'up' | 'down';
}

@ApiTags('health')
@Controller('health')
// Probes run on a fixed schedule and would otherwise consume the rate-limit
// budget of whatever IP the orchestrator uses.
@SkipThrottle()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness: is the process running at all?
   *
   * @returns Basic process status.
   */
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  check(): HealthStatus {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness: can the process actually serve traffic?
   *
   * Issues a trivial query to confirm the connection pool is alive.
   *
   * @returns Status including database reachability.
   * @throws {ServiceUnavailableException} When the database cannot be reached.
   */
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe (includes a database round-trip)' })
  async ready(): Promise<HealthStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        status: 'degraded',
        database: 'down',
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: 'ok',
      database: 'up',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
