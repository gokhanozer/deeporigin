/**
 * Request/response logging with duration timing.
 *
 * Applied globally so every endpoint gets consistent access logs without any
 * per-controller boilerplate.
 */

import {
  CallHandler,
  ExecutionContext,
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
        // On error the status is not yet on the response object; the exception
        // filter owns that logging, so we only record the timing.
        error: () => this.log(request, response.statusCode || 500, startedAt),
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
    this.logger.log(`${request.method} ${request.originalUrl} ${status} - ${duration}ms`);
  }
}
