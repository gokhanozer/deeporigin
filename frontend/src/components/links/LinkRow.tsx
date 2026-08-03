'use client';

/**
 * One row in a link list.
 *
 * Shows the short URL, its destination and its visit count, with owner-only
 * edit and delete actions. Used by both the public list and the dashboard, so
 * the two stay visually identical.
 */

import NextLink from 'next/link';
import { CopyButton } from '../ui/CopyButton';
import { Badge } from '../ui/Feedback';
import { formatNumber, formatRelativeTime, pluralize, stripProtocol, truncateMiddle } from '../../lib/format';
import { useToast } from '../../providers/ToastProvider';
import { isExpired } from '../../lib/link-state';
import type { Link } from '../../lib/types';

export interface LinkRowProps {
  link: Link;
  /** Opens the slug editor. Only rendered for links the viewer owns. */
  onEdit?: (link: Link) => void;
  /** Deletes the link. Only rendered for links the viewer owns. */
  onDelete?: (link: Link) => void;
}

/**
 * Renders a single link row.
 *
 * @param props The link and its owner actions.
 * @returns The row element.
 */
export function LinkRow({ link, onEdit, onDelete }: LinkRowProps): React.JSX.Element {
  const { showSuccess } = useToast();
  const expired = isExpired(link);

  return (
    <li className="flex flex-col gap-3 border-b border-border/70 px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
      {/* ---- Identity: short URL, title and destination ---- */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={link.shortUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-sm font-medium text-brand-hover hover:underline"
          >
            {stripProtocol(link.shortUrl)}
          </a>

          {link.isCustomSlug && <Badge tone="brand">custom</Badge>}
          {!link.isActive && <Badge tone="danger">disabled</Badge>}
          {expired && <Badge tone="warning">expired</Badge>}
        </div>

        {link.title && <p className="mt-1 truncate text-sm text-content">{link.title}</p>}

        <a
          href={link.targetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="break-anywhere mt-0.5 block text-xs text-subtle transition-colors hover:text-muted"
          title={link.targetUrl}
        >
          → {truncateMiddle(stripProtocol(link.targetUrl), 72)}
        </a>
      </div>

      {/* ---- Metrics ---- */}
      <div className="flex shrink-0 items-center gap-6 sm:gap-8">
        <div className="text-right">
          <p className="text-sm font-semibold tabular-nums text-content">
            {formatNumber(link.visitCount)}
          </p>
          <p className="text-xs text-subtle">{pluralize(link.visitCount, 'visit')}</p>
        </div>

        <div className="hidden text-right lg:block">
          <p className="text-xs text-muted">{formatRelativeTime(link.lastVisitedAt)}</p>
          <p className="text-xs text-subtle">last visit</p>
        </div>
      </div>

      {/* ---- Actions ---- */}
      <div className="flex shrink-0 items-center gap-1.5">
        <CopyButton
          value={link.shortUrl}
          size="sm"
          label=""
          onCopied={() => showSuccess('Copied to clipboard')}
        />

        <NextLink href={`/dashboard/links/${link.id}`}>
          <IconButton label="View analytics">
            <ChartIcon />
          </IconButton>
        </NextLink>

        {/* Owner-only controls. `isOwner` is computed server-side, and the API
            re-checks ownership — hiding the buttons is UX, not security. */}
        {link.isOwner && onEdit && (
          <IconButton label="Edit slug" onClick={() => onEdit(link)}>
            <PencilIcon />
          </IconButton>
        )}

        {link.isOwner && onDelete && (
          <IconButton label="Delete link" danger onClick={() => onDelete(link)}>
            <TrashIcon />
          </IconButton>
        )}
      </div>
    </li>
  );
}

/** Props for the compact icon button used in the actions column. */
interface IconButtonProps {
  children: React.ReactNode;
  /** Accessible name — the button has no visible text. */
  label: string;
  onClick?: () => void;
  danger?: boolean;
}

/**
 * Renders a small square icon button.
 *
 * @param props Icon, accessible label and handler.
 * @returns The button element.
 */
function IconButton({ children, label, onClick, danger }: IconButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      // The icon is decorative, so the accessible name must come from here.
      aria-label={label}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-raised transition-colors hover:border-border-strong ${
        danger ? 'text-subtle hover:text-danger' : 'text-muted hover:text-content'
      }`}
    >
      {children}
    </button>
  );
}

/** Shared attributes for the outline icons below. */
const ICON_PROPS = {
  className: 'h-4 w-4',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

/** Bar-chart glyph for the analytics action. */
function ChartIcon(): React.JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

/** Pencil glyph for the edit action. */
function PencilIcon(): React.JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

/** Bin glyph for the delete action. */
function TrashIcon(): React.JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}
