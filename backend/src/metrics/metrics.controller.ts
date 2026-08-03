/**
 * Prometheus scrape endpoint.
 *
 * ⚠️ **Do not expose this publicly.** The exposition reveals route names,
 * traffic volume and internal timings — useful reconnaissance. In a real
 * deployment it should be bound to an internal port or restricted by network
 * policy, so only the Prometheus server can reach it. It is served on the main
 * port here purely so the demo stack works without extra plumbing.
 */

import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { MetricsService } from './metrics.service';

@ApiExcludeController()
@Controller('metrics')
// Prometheus scrapes on a fixed interval — typically every 15s, from every
// replica. Left throttled, those scrapes would consume the rate-limit budget of
// whichever IP the scraper uses, exactly as the health probes would have.
@SkipThrottle()
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  /**
   * Serves the metrics exposition.
   *
   * The content type is what Prometheus content-negotiates on; returning
   * `application/json` here would make the scrape fail.
   *
   * @returns Prometheus text-format metrics.
   */
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  render(): Promise<string> {
    return this.metrics.render();
  }
}
