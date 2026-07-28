/**
 * Global exception filter producing a single, predictable error shape.
 *
 * Without it, clients would have to handle three different payload shapes
 * (Nest's `HttpException` body, Prisma's error objects, and raw crashes). With
 * it, the frontend's API client has exactly one contract to parse — see
 * `frontend/src/lib/api-client.ts`.
 */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

/** The uniform error body returned for every failed request. */
export interface ApiErrorResponse {
  statusCode: number;
  /** Short machine-readable label, e.g. `Bad Request`. */
  error: string;
  /** Human-readable description, safe to show to end users. */
  message: string;
  /** Field-level validation failures, when applicable. */
  details?: string[];
  /** Request path that produced the error. */
  path: string;
  /** ISO timestamp, useful when correlating with server logs. */
  timestamp: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  /**
   * Converts any thrown value into an {@link ApiErrorResponse}.
   *
   * @param exception The thrown value — an `HttpException`, a Prisma error, or anything else.
   * @param host      Nest's arguments host, used to reach the Express response.
   */
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, error, message, details } = this.describe(exception);

    // 5xx indicates a bug on our side, so log the whole stack. 4xx is the
    // client's problem and would otherwise flood the logs, so stay quiet.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const body: ApiErrorResponse = {
      statusCode: status,
      error,
      message,
      ...(details && details.length > 0 ? { details } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(body);
  }

  /**
   * Maps a thrown value to a status code and user-safe message.
   *
   * @param exception The thrown value.
   * @returns Normalised status, label, message and optional field details.
   */
  private describe(exception: unknown): {
    status: number;
    error: string;
    message: string;
    details?: string[];
  } {
    // 1. Nest's own exceptions already carry the right status and message.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return { status, error: exception.name, message: payload };
      }

      const record = payload as Record<string, unknown>;
      // `ValidationPipe` puts an array of field errors in `message`; surface the
      // first as the headline and keep the rest as structured details.
      const rawMessage = record.message;
      const details = Array.isArray(rawMessage) ? rawMessage.map(String) : undefined;

      return {
        status,
        error: typeof record.error === 'string' ? record.error : exception.name,
        message: details?.[0] ?? (typeof rawMessage === 'string' ? rawMessage : exception.message),
        details,
      };
    }

    // 2. Prisma errors: translate the codes we can act on into proper HTTP
    //    semantics instead of leaking a 500 with database internals.
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': // Unique constraint violation.
          return {
            status: HttpStatus.CONFLICT,
            error: 'Conflict',
            message: 'That value is already taken',
          };
        case 'P2025': // Record required but not found.
          return {
            status: HttpStatus.NOT_FOUND,
            error: 'Not Found',
            message: 'The requested resource could not be found',
          };
        case 'P2003': // Foreign key constraint failed.
          return {
            status: HttpStatus.BAD_REQUEST,
            error: 'Bad Request',
            message: 'Referenced resource does not exist',
          };
        default:
          break;
      }
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Invalid query parameters',
      };
    }

    // 3. Anything else is an unexpected bug. Never echo the raw message — it
    //    can contain connection strings, file paths or query fragments.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Something went wrong. Please try again.',
    };
  }
}
