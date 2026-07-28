'use client';

/**
 * Debounce hook.
 *
 * Used by the search box and the live slug-availability check so a request is
 * issued once the user pauses, rather than on every keystroke.
 */

import { useEffect, useState } from 'react';

/**
 * Returns a copy of `value` that only updates after `delayMs` of quiet.
 *
 * @typeParam T Value type.
 * @param value   The rapidly-changing value.
 * @param delayMs Quiet period before the value settles. Defaults to 300ms.
 * @returns The debounced value.
 *
 * @example
 * const debouncedSearch = useDebouncedValue(search, 400);
 * useEffect(() => { void runSearch(debouncedSearch); }, [debouncedSearch]);
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    // Clearing on every change is what produces the debounce: the timer only
    // ever fires once the value has stopped changing.
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
