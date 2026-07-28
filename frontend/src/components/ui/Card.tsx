/**
 * Card container and its header.
 *
 * The single surface treatment used across the app, so panels never drift apart
 * in radius, border or padding.
 */

import type { ReactNode } from 'react';

export interface CardProps {
  children: ReactNode;
  className?: string;
  /** Removes the default padding, for cards holding a full-bleed table. */
  flush?: boolean;
}

/**
 * Renders a surface panel.
 *
 * @param props Card content and options.
 * @returns The card element.
 */
export function Card({ children, className = '', flush = false }: CardProps): React.JSX.Element {
  return (
    <div
      className={`rounded-card border border-border bg-surface ${flush ? '' : 'p-5'} ${className}`}
    >
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  /** Panel title. */
  title: ReactNode;
  /** Optional supporting line beneath the title. */
  description?: ReactNode;
  /** Optional controls aligned to the right, e.g. a filter. */
  action?: ReactNode;
  className?: string;
}

/**
 * Renders a card's title block with an optional action.
 *
 * @param props Header content.
 * @returns The header element.
 */
export function CardHeader({
  title,
  description,
  action,
  className = '',
}: CardHeaderProps): React.JSX.Element {
  return (
    <div className={`mb-4 flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-content">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-subtle">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
