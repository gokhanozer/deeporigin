'use client';

/**
 * Copy-to-clipboard hook with a transient "copied" confirmation.
 *
 * Implements the task's "make it easy to copy the shortened URL" requirement,
 * including a fallback for browsers and contexts where the async Clipboard API
 * is unavailable (notably any page served over plain HTTP other than
 * `localhost`, where `navigator.clipboard` is simply `undefined`).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** Value returned by {@link useClipboard}. */
export interface UseClipboardResult {
  /** `true` for a short window after a successful copy. */
  copied: boolean;
  /** Copies text and flips `copied`. Resolves to whether it succeeded. */
  copy: (text: string) => Promise<boolean>;
  /** Set when the copy failed, so the UI can prompt a manual copy. */
  error: string | null;
}

/**
 * Provides a `copy` function plus a self-resetting `copied` flag.
 *
 * @param resetDelayMs How long `copied` stays true. Defaults to 2000ms.
 * @returns Clipboard state and the copy action.
 *
 * @example
 * const { copy, copied } = useClipboard();
 * <button onClick={() => copy(link.shortUrl)}>{copied ? 'Copied!' : 'Copy'}</button>
 */
export function useClipboard(resetDelayMs = 2000): UseClipboardResult {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Held in a ref so a rapid second copy cancels the first timer rather than
  // letting it clear the flag early.
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clearing on unmount prevents a setState on an unmounted component.
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      setError(null);

      const succeeded = await writeToClipboard(text);

      if (succeeded) {
        setCopied(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setCopied(false), resetDelayMs);
      } else {
        setError('Could not copy — please copy the link manually.');
      }

      return succeeded;
    },
    [resetDelayMs],
  );

  return { copied, copy, error };
}

/**
 * Writes text to the clipboard, preferring the modern API.
 *
 * @param text Text to copy.
 * @returns Whether the copy succeeded.
 */
async function writeToClipboard(text: string): Promise<boolean> {
  // Preferred path: available on HTTPS and on localhost.
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or the document is not focused — fall through.
    }
  }

  // Fallback: the deprecated `execCommand` still works everywhere else. The
  // textarea is positioned off-screen so the page does not visibly jump.
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const succeeded = document.execCommand('copy');
    document.body.removeChild(textarea);
    return succeeded;
  } catch {
    return false;
  }
}
