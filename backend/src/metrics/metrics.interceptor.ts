/**
 * Times every HTTP request and records it against a **route template**.
 *
 * The template is the whole point. `req.url` for a request to `/links/abc-123`
 * yields exactly that string, and using it as a label would create one time
 * series per link — unbounded growth that eventually exhausts Prometheus.
 * Nest's route pattern (`/links/:id`) collapses all of them into one series.
 *
 * Requests that reach no controller (404s on unknown paths) are dropped rather
 * than recorded, because they have no template — and a scanner probing random
 * URLs would otherwise be the very thing that blows up cardinality.
 */

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  /**
   * Observes the request and records its duration on completion.
   *
   * @param context Execution context for the current request.
   * @param next    Downstream handler.
   * @returns The untouched response stream — this interceptor only measures.
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const route = this.resolveRoute(request);
    // No template means no safe label — skip rather than risk unbounded growth.
    if (!route) return next.handle();

    // Excluding the scrape endpoint from its own metrics keeps the numbers
    // about real traffic rather than about monitoring.
    if (route.startsWith('/metrics')) return next.handle();

    const startedAt = process.hrtime.bigint();

    /** Records the observation exactly once, whatever the outcome. */
    const record = (status: number): void => {
      const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
      this.metrics.httpDuration.observe(
        { method: request.method, route, status: String(status) },
        seconds,
      );
    };

    return next.handle().pipe(
      tap({
        next: () => record(response.statusCode),
        // On error the status is not yet on the response; the exception filter
        // will set it. Falling back to 500 keeps the error path measured rather
        // than silently missing.
        error: (error: { status?: number }) => record(error?.status ?? response.statusCode ?? 500),
      }),
    );
  }

  /**
   * Extracts the Express route pattern for a request.
   *
   * `req.route.path` is the registered pattern (`/:id`), and `req.baseUrl` is
   * the mount prefix, so joining them reconstructs the full template.
   *
   * @param request Inbound request.
   * @returns The route template, or `null` when the request matched no route.
   */
  private resolveRoute(request: Request): string | null {
    const pattern = (request.route as { path?: string } | undefined)?.path;
    if (!pattern) return null;

    const base = request.baseUrl ?? '';
    const full = `${base}${pattern}`.replace(/\/+$/, '');
    return full.length > 0 ? full : '/';
  }
}
