/**
 * Prometheus instrumentation.
 *
 * Marked `@Global()` so feature services can inject {@link MetricsService} to
 * increment domain counters without every module importing this one — the same
 * reasoning as `PrismaModule`. Metrics are cross-cutting infrastructure, not a
 * feature dependency.
 */

import { Global, Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
