/**
 * Request/response logging with duration timing.
 *
 * Applied globally so every endpoint gets consistent access logs without any
 * per-controller boilerplate.
 */

import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  /**
   * Logs each request once it completes, including its status and duration.
   *
   * @param context Execution context for the current request.
   * @param next    The downstream handler.
   * @returns The untouched response stream (this interceptor only observes).
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.log(request, response.statusCode, startedAt),

        // On the error path `response.statusCode` is still its default 200 —
        // the exception filter has not run yet, so it has not been set. Reading
        // it here logged EVERY failure as "200", which made the access log
        // actively misleading: a 403 storm looked like healthy traffic.
        //
        // The thrown value carries the real status, so take it from there:
        // HttpException exposes getStatus(), and anything else is a genuine
        // unhandled error, i.e. a 500.
        error: (error: unknown) => this.log(request, resolveStatus(error), startedAt),
      }),
    );
  }

  /**
   * Emits a single formatted access-log line.
   *
   * @param request   Inbound request.
   * @param status    Final HTTP status code.
   * @param startedAt Epoch milliseconds when handling began.
   */
  private log(request: Request, status: number, startedAt: number): void {
    const duration = Date.now() - startedAt;
    const line = `${request.method} ${request.originalUrl} ${status} - ${duration}ms`;

    // Failures logged at their own level, so `docker compose logs | grep WARN`
    // surfaces client errors without wading through successful traffic.
    if (status >= 500) this.logger.error(line);
    else if (status >= 400) this.logger.warn(line);
    else this.logger.log(line);
  }
}

/**
 * Extracts the HTTP status from a thrown value.
 *
 * @param error The value thrown by the handler.
 * @returns The status it will produce, defaulting to 500.
 */
function resolveStatus(error: unknown): number {
  if (error instanceof HttpException) return error.getStatus();
  // Some libraries throw plain objects carrying a status.
  const status = (error as { status?: unknown })?.status;
  return typeof status === 'number' ? status : 500;
}
