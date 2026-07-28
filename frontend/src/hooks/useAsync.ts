'use client';

/**
 * Async data-fetching hooks.
 *
 * Every screen needs the same loading / error / data state machine. Rather than
 * repeating three `useState` calls and a `useEffect` in each component — and
 * getting the race conditions subtly wrong each time — that logic lives here.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toErrorMessage } from '../lib/api-client';

/** State returned by {@link useAsyncData}. */
export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  /** User-facing error message, or `null`. */
  error: string | null;
  /** Re-runs the fetch, e.g. after a mutation. */
  refetch: () => void;
}

/**
 * Runs an async function on mount and whenever `deps` change.
 *
 * Guards against the classic out-of-order-response bug: if the inputs change
 * while a request is in flight, the stale response is discarded rather than
 * overwriting fresher data.
 *
 * @typeParam T Resolved data type.
 * @param fetcher Function performing the request. Must be stable — wrap it in
 *                `useCallback` if it closes over props or state.
 * @param deps    Dependency list controlling re-fetching.
 * @returns Data, loading and error state, plus a `refetch` action.
 *
 * @example
 * const fetchLinks = useCallback(() => listLinks({ page }), [page]);
 * const { data, loading, error, refetch } = useAsyncData(fetchLinks, [page]);
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList = [],
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Incremented per request; only the newest is allowed to commit its result.
  const requestIdRef = useRef(0);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetcher()
      .then((result) => {
        // Ignore this response if a newer request has since started.
        if (cancelled || requestId !== requestIdRef.current) return;
        setData(result);
      })
      .catch((caught: unknown) => {
        if (cancelled || requestId !== requestIdRef.current) return;
        setError(toErrorMessage(caught));
      })
      .finally(() => {
        if (cancelled || requestId !== requestIdRef.current) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `fetcher` is intentionally omitted: callers express its dependencies
    // through `deps`, which avoids an infinite loop when an inline arrow is passed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken]);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  return { data, loading, error, refetch };
}

/** State returned by {@link useAsyncAction}. */
export interface AsyncActionState<TArgs extends unknown[], TResult> {
  /** Invokes the action. Resolves to the result, or `null` when it failed. */
  run: (...args: TArgs) => Promise<TResult | null>;
  /** `true` while the action is in flight — bind to a button's `disabled`. */
  pending: boolean;
  error: string | null;
  /** Clears the error, e.g. when the user edits the form again. */
  reset: () => void;
}

/**
 * Wraps a one-off async action (submit, delete, save) with pending/error state.
 *
 * Errors are captured into state instead of propagating, so a failed request
 * shows a message rather than triggering an error boundary.
 *
 * @typeParam TArgs   Argument tuple of the action.
 * @typeParam TResult Resolved result type.
 * @param action The async function to wrap.
 * @returns The wrapped action plus its state.
 *
 * @example
 * const { run: save, pending, error } = useAsyncAction(updateLink);
 * await save(link.id, { slug: 'new-slug' });
 */
export function useAsyncAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
): AsyncActionState<TArgs, TResult> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args: TArgs): Promise<TResult | null> => {
      setPending(true);
      setError(null);
      try {
        const result = await action(...args);
        return result;
      } catch (caught) {
        // Skip the update if the component unmounted mid-request.
        if (mountedRef.current) setError(toErrorMessage(caught));
        return null;
      } finally {
        if (mountedRef.current) setPending(false);
      }
    },
    [action],
  );

  const reset = useCallback(() => setError(null), []);

  return { run, pending, error, reset };
}
