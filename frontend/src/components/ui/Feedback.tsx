/**
 * Small feedback primitives: alerts, badges, empty states, skeletons and
 * spinners.
 *
 * Grouped in one module because each is only a few lines, and every list or
 * panel in the app needs the same four states — loading, empty, error, loaded.
 */

import type { ReactNode } from 'react';

/* -------------------------------------------------------------------------- */
/* Alert                                                                       */
/* -------------------------------------------------------------------------- */

/** Severity of an alert. */
export type AlertVariant = 'error' | 'success' | 'info' | 'warning';

export interface AlertProps {
  variant?: AlertVariant;
  children: ReactNode;
  className?: string;
}

/** Colour treatment per severity. */
const ALERT_STYLES: Record<AlertVariant, string> = {
  error: 'border-danger/30 bg-danger/10 text-rose-200',
  success: 'border-success/30 bg-success/10 text-emerald-200',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
  warning: 'border-warning/30 bg-warning/10 text-amber-200',
};

/**
 * Renders an inline message block.
 *
 * Errors carry `role="alert"` so they interrupt a screen reader immediately;
 * milder variants use the polite `status` role instead.
 *
 * @param props Alert content and severity.
 * @returns The alert element.
 */
export function Alert({
  variant = 'info',
  children,
  className = '',
}: AlertProps): React.JSX.Element {
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={`rounded-lg border px-4 py-3 text-sm ${ALERT_STYLES[variant]} ${className}`}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Badge                                                                       */
/* -------------------------------------------------------------------------- */

/** Semantic tone of a badge. */
export type BadgeTone = 'neutral' | 'brand' | 'success' | 'danger' | 'warning';

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

/** Colour treatment per tone. */
const BADGE_STYLES: Record<BadgeTone, string> = {
  neutral: 'border-border bg-surface-raised text-muted',
  brand: 'border-brand/40 bg-brand/15 text-indigo-200',
  success: 'border-success/30 bg-success/10 text-emerald-200',
  danger: 'border-danger/30 bg-danger/10 text-rose-200',
  warning: 'border-warning/30 bg-warning/10 text-amber-200',
};

/**
 * Renders a small status pill.
 *
 * @param props Badge content and tone.
 * @returns The badge element.
 */
export function Badge({
  tone = 'neutral',
  children,
  className = '',
}: BadgeProps): React.JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${BADGE_STYLES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Spinner                                                                     */
/* -------------------------------------------------------------------------- */

export interface SpinnerProps {
  /** Diameter in pixels. Defaults to 20. */
  size?: number;
  className?: string;
  /** Accessible label announced while loading. */
  label?: string;
}

/**
 * Renders a loading spinner.
 *
 * @param props Spinner options.
 * @returns The spinner element.
 */
export function Spinner({
  size = 20,
  className = '',
  label = 'Loading',
}: SpinnerProps): React.JSX.Element {
  return (
    <svg
      className={`animate-spin text-muted ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label={label}
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* EmptyState                                                                  */
/* -------------------------------------------------------------------------- */

export interface EmptyStateProps {
  /** Decorative glyph. */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Optional call to action. */
  action?: ReactNode;
}

/**
 * Renders the "nothing here yet" placeholder.
 *
 * An explicit empty state, rather than a blank area, tells the user the app is
 * working and suggests what to do next.
 *
 * @param props Empty-state content.
 * @returns The placeholder element.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && (
        <div className="mb-3 text-3xl opacity-60" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-content">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-subtle">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Skeleton                                                                    */
/* -------------------------------------------------------------------------- */

export interface SkeletonProps {
  className?: string;
  /** Number of stacked bars to render. Defaults to 1. */
  rows?: number;
}

/**
 * Renders shimmering placeholder bars.
 *
 * Preferable to a bare spinner for lists: it preserves the page's layout, so
 * content does not jump when it arrives.
 *
 * @param props Skeleton options.
 * @returns The placeholder element.
 */
export function Skeleton({ className = 'h-4 w-full', rows = 1 }: SkeletonProps): React.JSX.Element {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={`animate-pulse rounded bg-surface-raised ${className}`} />
      ))}
    </div>
  );
}
