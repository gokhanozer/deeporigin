'use client';

/**
 * Success card shown after a URL is shortened.
 *
 * Mirrors the "Success! Here's your short URL" panel in the task's mock-up: the
 * short link is prominent, selectable, and one click from the clipboard.
 */

import { CopyButton } from '../ui/CopyButton';
import { Card } from '../ui/Card';
import { truncateMiddle } from '../../lib/format';
import { useToast } from '../../providers/ToastProvider';
import type { Link } from '../../lib/types';

export interface ShortUrlResultProps {
  /** The newly created link. */
  link: Link;
  /** Called when the user dismisses the card. */
  onDismiss?: () => void;
}

/**
 * Renders the created short link with a copy action.
 *
 * @param props The link and an optional dismiss handler.
 * @returns The success card.
 */
export function ShortUrlResult({ link, onDismiss }: ShortUrlResultProps): React.JSX.Element {
  const { showSuccess } = useToast();

  return (
    <Card className="animate-fade-in border-success/30 bg-success/5">
      <div className="flex items-start justify-between gap-3">
        {/* Shortening a URL that already has a link returns the original rather
            than a duplicate. Saying so avoids the impression that nothing
            happened, or that a new link was made when it was not.

            The wording differs by who is asking: a signed-in user is being
            reminded of their own earlier link, while an anonymous visitor may
            never have seen this one before and is being handed a shared,
            unowned link. */}
        <p className="text-sm font-medium text-emerald-200">
          {!link.alreadyExisted
            ? 'Success! Here’s your short URL'
            : link.isOwner
              ? 'You already shortened this — here’s your existing link'
              : 'This URL already has a short link for anonymous users'}
        </p>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-subtle transition-colors hover:text-content"
            aria-label="Dismiss"
          >
            ✕
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        {/*
          A real anchor, not styled text: the user can middle-click, open in a
          new tab, or copy via the context menu — all the things a link should do.
        */}
        <a
          href={link.shortUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="break-anywhere flex-1 rounded-lg border border-border bg-surface px-3 py-2.5 font-mono text-sm text-brand-hover transition-colors hover:border-border-strong"
        >
          {link.shortUrl}
        </a>

        <CopyButton
          value={link.shortUrl}
          onCopied={() => showSuccess('Short URL copied to clipboard')}
        />
      </div>

      <p className="mt-3 text-xs text-subtle">
        Redirects to{' '}
        <span className="text-muted" title={link.targetUrl}>
          {truncateMiddle(link.targetUrl, 64)}
        </span>
      </p>
    </Card>
  );
}
