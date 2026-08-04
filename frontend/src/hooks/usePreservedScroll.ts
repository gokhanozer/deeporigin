'use client';

/**
 * Keeps the page where it is across a re-render that changes content height.
 *
 * Chrome and Firefox do this themselves through CSS scroll anchoring: when an
 * element above the viewport grows or disappears, they adjust the scroll offset
 * so what you were reading stays put. **Safari has never implemented it**, and
 * older Edge did not either, so the same interaction that feels stable in
 * Chrome throws the reader back to the top elsewhere.
 *
 * This restores the offset explicitly, which behaves identically everywhere.
 *
 * @example
 * const { preserve, release } = usePreservedScroll([view, rows], !loading);
 * // before a state change that reflows the page:
 * preserve();
 * // before a deliberate scroll of your own:
 * release();
 */

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

/**
 * `useLayoutEffect` warns when it runs during server rendering, and this hook
 * lives in a component Next renders on the server first. The layout variant is
 * still what is wanted in the browser: it runs before paint, so the correction
 * is never visible as a flicker.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Controls returned by {@link usePreservedScroll}. */
export interface PreservedScroll {
  /** Records the current offset, to be restored after the next re-render. */
  preserve: () => void;
  /** Discards a pending restore, so a deliberate scroll is not undone. */
  release: () => void;
}

/**
 * Restores the scroll offset after a height-changing update.
 *
 * @param deps    Values whose change reflows the page — the restore runs after
 *                any of them updates.
 * @param settled `false` while more content is still arriving, which keeps the
 *                offset pinned across the second reflow when async data lands.
 *                The pending offset is discarded once this is `true`.
 * @returns Controls for arming and cancelling the restore.
 */
export function usePreservedScroll(
  deps: React.DependencyList,
  settled = true,
): PreservedScroll {
  const targetRef = useRef<number | null>(null);

  const preserve = useCallback(() => {
    targetRef.current = window.scrollY;
  }, []);

  const release = useCallback(() => {
    targetRef.current = null;
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (targetRef.current === null) return;

    window.scrollTo({ top: targetRef.current, behavior: 'auto' });

    // Held across the loading render so the offset survives both reflows: the
    // one when the view switches, and the one when its rows arrive.
    if (settled) targetRef.current = null;
    // `deps` is the caller's contract, spread deliberately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, settled]);

  return { preserve, release };
}
