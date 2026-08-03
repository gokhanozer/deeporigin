/**
 * Service index — the response to `GET /{apiPrefix}`.
 *
 * The API prefix is a mount point, not a route, so hitting it bare used to
 * return a 404 even though the README presents it as the API's address. Rather
 * than teach the docs to apologise for that, the prefix now answers with a map
 * of the service: what this is, and where to go next.
 *
 * The convention is a common one — `api.github.com` returns a URL index for the
 * same reason — and it gives anyone exploring the API a starting point that does
 * not require reading the README first.
 */

import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { AppConfig } from './config/configuration';

/** Payload returned by the service index. */
export interface ServiceIndex {
  /** Human-readable service name. */
  name: string;
  /** API version, matching the prefix. */
  version: string;
  /** Path to the Swagger UI, or `null` when documentation is disabled. */
  docs: string | null;
  /** Path to the readiness probe. */
  health: string;
  /** Entry point for each feature area. */
  endpoints: Record<string, string>;
}

@ApiTags('meta')
@Controller()
// Exploring the index should never consume the caller's rate-limit budget, and
// it reads no state — same reasoning as the health probes.
@SkipThrottle()
export class AppController {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  /**
   * Describes the service and lists its entry points.
   *
   * Paths are built from the configured prefix rather than hard-coded, so
   * changing `API_PREFIX` cannot leave this response pointing at URLs that no
   * longer exist.
   *
   * @returns The service index.
   */
  @Get()
  @ApiOperation({ summary: 'Service index — version and entry points' })
  index(): ServiceIndex {
    const prefix = `/${this.config.get('apiPrefix', { infer: true })}`;
    const swaggerEnabled = this.config.get('swaggerEnabled', { infer: true });

    return {
      name: 'Shortly URL Shortener API',
      version: '1.0',
      docs: swaggerEnabled ? `${prefix}/docs` : null,
      health: `${prefix}/health/ready`,
      endpoints: {
        links: `${prefix}/links`,
        auth: `${prefix}/auth`,
        redirect: `${prefix}/redirect/{slug}`,
        analytics: `${prefix}/analytics/overview`,
        metrics: `${prefix}/metrics`,
      },
    };
  }
}
