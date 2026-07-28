/**
 * Button primitive.
 *
 * One component covers every button in the app through `variant` and `size`
 * props, so spacing, focus rings and disabled styling stay consistent
 * everywhere instead of being re-invented per screen.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** Visual weight of the button. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

/** Physical size of the button. */
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks interaction while an action is in flight. */
  loading?: boolean;
  /** Stretches the button to the width of its container. */
  fullWidth?: boolean;
  /** Optional leading icon. */
  icon?: ReactNode;
  children?: ReactNode;
}

/** Classes shared by every variant. */
const BASE_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2';

/** Per-variant colour treatment. */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover shadow-sm shadow-brand/30',
  secondary: 'bg-surface-raised text-content border border-border hover:border-border-strong',
  ghost: 'text-muted hover:text-content hover:bg-surface-raised',
  danger: 'bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25',
};

/** Per-size padding and type scale. */
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

/**
 * Renders a styled button.
 *
 * @param props Button configuration and any native button attributes.
 * @returns The button element.
 *
 * @example
 * <Button variant="primary" loading={saving} onClick={save}>Save</Button>
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  icon,
  children,
  className = '',
  disabled,
  type = 'button',
  ...rest
}: ButtonProps): React.JSX.Element {
  return (
    <button
      // Defaults to `button`: an unspecified type inside a form is `submit`,
      // which silently submits the form on any stray click.
      type={type}
      // A loading button must not be clickable twice.
      disabled={disabled || loading}
      // Tells assistive technology the control is busy.
      aria-busy={loading || undefined}
      className={`${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${
        fullWidth ? 'w-full' : ''
      } ${className}`}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

/**
 * Small inline spinner shown while a button is loading.
 *
 * @returns The spinner element.
 */
function Spinner(): React.JSX.Element {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      // Decorative: `aria-busy` on the button already conveys the state.
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}
