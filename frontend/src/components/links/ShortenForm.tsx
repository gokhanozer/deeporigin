'use client';

/**
 * The URL-shortening form — the app's primary action, and the screen the task's
 * mock-up specifies.
 *
 * Validation runs at three points, deliberately:
 *  1. **on blur** — so the user is not scolded mid-typing;
 *  2. **on submit** — the guard that actually blocks a bad request;
 *  3. **on the server** — the only check that is authoritative.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Alert } from '../ui/Feedback';
import { ShortUrlResult } from './ShortUrlResult';
import { useAsyncAction } from '../../hooks/useAsync';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { checkSlugAvailability, createLink } from '../../lib/api/links';
import { validateSlug, validateUrl } from '../../lib/validators';
import type { Link } from '../../lib/types';

export interface ShortenFormProps {
  /** Called after a successful creation, e.g. to refresh a list. */
  onCreated?: (link: Link) => void;
}

/** Availability states for the custom-slug field. */
type SlugStatus = 'idle' | 'checking' | 'available' | 'taken';

/**
 * Renders the shorten form and, on success, the resulting short link.
 *
 * @param props Optional creation callback.
 * @returns The form element.
 */
export function ShortenForm({ onCreated }: ShortenFormProps): React.JSX.Element {
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);

  const [showCustomSlug, setShowCustomSlug] = useState(false);
  const [slug, setSlug] = useState('');
  const [slugError, setSlugError] = useState<string | null>(null);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>('idle');

  const [result, setResult] = useState<Link | null>(null);

  const { run: submit, pending, error: submitError, reset: resetSubmitError } =
    useAsyncAction(createLink);

  // Debounced so availability is checked once the user pauses, not per keystroke.
  const debouncedSlug = useDebouncedValue(slug, 400);

  // ---- Live slug availability ---------------------------------------------
  useEffect(() => {
    if (!showCustomSlug || debouncedSlug.length === 0) {
      setSlugStatus('idle');
      return;
    }

    const localCheck = validateSlug(debouncedSlug);
    if (!localCheck.valid) {
      // Format problems are caught locally; no point asking the server.
      setSlugError(localCheck.reason ?? null);
      setSlugStatus('idle');
      return;
    }

    setSlugError(null);
    setSlugStatus('checking');

    let cancelled = false;
    checkSlugAvailability(debouncedSlug)
      .then((availability) => {
        if (cancelled) return;
        setSlugStatus(availability.available ? 'available' : 'taken');
        setSlugError(availability.available ? null : (availability.reason ?? 'That slug is taken'));
      })
      .catch(() => {
        // A failed availability check must not block submission — the server
        // re-checks on create, and a 409 there is handled gracefully.
        if (!cancelled) setSlugStatus('idle');
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSlug, showCustomSlug]);

  /** Validates the URL field, returning whether it passed. */
  const validateUrlField = useCallback((): boolean => {
    const check = validateUrl(url);
    setUrlError(check.valid ? null : (check.reason ?? 'Please enter a valid URL'));
    return check.valid;
  }, [url]);

  /**
   * Validates everything and creates the link.
   *
   * @param event The form submission event.
   */
  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    resetSubmitError();

    if (!validateUrlField()) return;

    if (showCustomSlug && slug.length > 0) {
      const check = validateSlug(slug);
      if (!check.valid) {
        setSlugError(check.reason ?? 'Invalid slug');
        return;
      }
    }

    const created = await submit({
      url: url.trim(),
      ...(showCustomSlug && slug.trim() ? { slug: slug.trim() } : {}),
    });

    if (created) {
      setResult(created);
      // Reset the form so the next URL can be pasted straight in.
      setUrl('');
      setSlug('');
      setSlugStatus('idle');
      setShowCustomSlug(false);
      onCreated?.(created);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Input
          label="Enter the URL to shorten"
          type="url"
          inputMode="url"
          placeholder="https://some.place.example.com/foo/bar/biz"
          value={url}
          autoComplete="off"
          // Native browser validation is suppressed (`noValidate`) so the
          // messages are ours, consistent, and styled with the rest of the app.
          onChange={(event) => {
            setUrl(event.target.value);
            if (urlError) setUrlError(null);
          }}
          onBlur={() => url.length > 0 && validateUrlField()}
          error={urlError}
          autoFocus
        />

        {/* ---- Optional custom slug ---- */}
        {showCustomSlug ? (
          <Input
            label="Custom slug"
            placeholder="my-link"
            value={slug}
            prefix={`${getShortDomain()}/`}
            onChange={(event) => setSlug(event.target.value)}
            error={slugError}
            hint={
              slugStatus === 'available'
                ? '✓ That slug is available'
                : 'Letters, numbers, hyphens and underscores'
            }
            suffix={
              slugStatus === 'checking' ? (
                <span className="text-xs text-subtle">Checking…</span>
              ) : slugStatus === 'available' ? (
                <span className="text-xs text-success" aria-hidden="true">
                  ✓
                </span>
              ) : null
            }
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowCustomSlug(true)}
            className="text-sm text-muted underline-offset-4 transition-colors hover:text-content hover:underline"
          >
            + Use a custom slug
          </button>
        )}

        {submitError && <Alert variant="error">{submitError}</Alert>}

        <Button
          type="submit"
          size="lg"
          loading={pending}
          // Blocked while the slug is known-taken, to save a doomed round-trip.
          disabled={showCustomSlug && slugStatus === 'taken'}
          fullWidth
        >
          {pending ? 'Shortening…' : 'Shorten'}
        </Button>
      </form>

      {result && <ShortUrlResult link={result} onDismiss={() => setResult(null)} />}
    </div>
  );
}

/**
 * Returns the short-link domain for the input prefix.
 *
 * Read from the browser's own location so the prefix always matches the domain
 * the user is actually on, with a build-time value as the server-render fallback.
 *
 * @returns A display host such as `short.ly` or `localhost:3000`.
 */
function getShortDomain(): string {
  if (typeof window !== 'undefined') return window.location.host;
  return (process.env.NEXT_PUBLIC_SHORT_DOMAIN ?? 'localhost:3000').replace(/^https?:\/\//, '');
}
