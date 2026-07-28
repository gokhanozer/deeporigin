/**
 * Typed HTTP client for the backend API.
 *
 * Every network call in the app goes through {@link apiRequest}, so
 * authentication, error normalisation, query-string building and JSON handling
 * are implemented exactly once. Components never touch `fetch` directly.
 */

import { getStoredToken } from './token-storage';
import type { ApiErrorBody } from './types';

/**
 * Base URL used by browser code.
 *
 * `NEXT_PUBLIC_` is inlined at build time and is therefore visible to the
 * client — which is correct here, since the browser must be able to reach the
 * API directly.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Base URL used by server-side code (route handlers, server components).
 *
 * Inside Docker the browser reaches the backend at `localhost:4000` while the
 * frontend container must use the service name `backend:4000`. Keeping the two
 * separate is what lets the same image serve both.
 */
export const INTERNAL_API_BASE_URL =
  process.env.API_INTERNAL_URL ?? API_BASE_URL;

/**
 * Error thrown for any non-2xx API response.
 *
 * Carries the parsed backend payload so a caller can distinguish a 409 slug
 * conflict from a 400 validation failure without re-parsing anything.
 */
export class ApiError extends Error {
  /** HTTP status code. */
  readonly status: number;
  /** Field-level validation messages, when the backend supplied them. */
  readonly details?: string[];

  /**
   * @param message User-safe message.
   * @param status  HTTP status code.
   * @param details Optional field-level errors.
   */
  constructor(message: string, status: number, details?: string[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  /** `true` when the caller must sign in (or sign in again). */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** `true` when a unique constraint (usually the slug) was violated. */
  get isConflict(): boolean {
    return this.status === 409;
  }

  /** `true` when the client has exceeded a rate limit. */
  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

/** Options accepted by {@link apiRequest}. */
export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  /** JSON-serialisable request body. */
  body?: unknown;
  /** Query parameters; `undefined` and `null` entries are omitted. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Bearer token. Defaults to the stored token in the browser. */
  token?: string | null;
  /** Use the server-side base URL instead of the public one. */
  internal?: boolean;
}

/**
 * Appends a query string to a path, skipping empty values.
 *
 * @param path  Path beginning with `/`.
 * @param query Parameters to serialise.
 * @returns The path with a query string, when there is anything to add.
 *
 * @example
 * buildUrl('/links', { page: 2, search: undefined }); // '/links?page=2'
 */
export function buildUrl(
  path: string,
  query?: ApiRequestOptions['query'],
): string {
  if (!query) return path;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    // Skipping empty values keeps URLs clean and avoids sending `search=`,
    // which the backend would treat as a real (empty) filter.
    if (value === undefined || value === null || value === '') continue;
    params.append(key, String(value));
  }

  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
}

/**
 * Performs an API request and returns the parsed JSON body.
 *
 * @typeParam T Expected response shape.
 * @param path    API path relative to the base URL, e.g. `/links`.
 * @param options Request options.
 * @returns The parsed response body.
 * @throws {ApiError} For any non-2xx response, or when the network is unreachable.
 *
 * @example
 * const links = await apiRequest<PaginatedResult<Link>>('/links', {
 *   query: { page: 1, mineOnly: true },
 * });
 */
export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { body, query, token, internal, headers, ...rest } = options;

  const baseUrl = internal ? INTERNAL_API_BASE_URL : API_BASE_URL;
  // `token === null` explicitly suppresses auth; `undefined` falls back to storage.
  const authToken = token === null ? null : (token ?? getStoredToken());

  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...((headers as Record<string, string>) ?? {}),
  };

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${buildUrl(path, query)}`, {
      ...rest,
      headers: requestHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // fetch only rejects on network-level failures, never on HTTP error codes.
    throw new ApiError('Unable to reach the server. Please check your connection.', 0);
  }

  // 204 No Content (e.g. DELETE) has no body to parse.
  if (response.status === 204) return undefined as T;

  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    const errorBody = payload as Partial<ApiErrorBody> | null;
    throw new ApiError(
      errorBody?.message ?? `Request failed with status ${response.status}`,
      response.status,
      errorBody?.details,
    );
  }

  return payload as T;
}

/**
 * Parses a response body as JSON without throwing on empty or malformed input.
 *
 * Error responses from a proxy (an nginx 502 HTML page, for instance) are not
 * JSON, and a parse failure there must not mask the real status code.
 *
 * @param response The fetch response.
 * @returns The parsed body, or `null` when it cannot be parsed.
 */
async function parseJsonSafely(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Extracts a user-facing message from any thrown value.
 *
 * Components use this in `catch` blocks so an unexpected non-`Error` throw
 * still produces something sensible on screen.
 *
 * @param error Any caught value.
 * @returns A message safe to display.
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}
