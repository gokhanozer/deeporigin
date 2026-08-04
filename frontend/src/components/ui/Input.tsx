/**
 * Text input with label, hint, error and optional prefix.
 *
 * Bundling the label and error message into the field is what keeps the
 * accessibility wiring correct: the label is always associated with the input,
 * and errors are always announced. Doing this per-form would guarantee it gets
 * forgotten somewhere.
 */

import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  /** Visible label. Always render one — placeholders are not labels. */
  label?: string;
  /** Validation message. Its presence switches the field into the error state. */
  error?: string | null;
  /** Helper text shown when there is no error. */
  hint?: ReactNode;
  /** Static text rendered inside the field, e.g. a short-domain prefix. */
  prefix?: string;
  /** Optional trailing adornment, e.g. an availability indicator. */
  suffix?: ReactNode;
}

/**
 * Renders a labelled text input.
 *
 * @param props Field configuration plus native input attributes.
 * @returns The field element.
 *
 * @example
 * <Input label="Custom slug" prefix="short.ly/" error={slugError} value={slug} onChange={…} />
 */
export function Input({
  label,
  error,
  hint,
  prefix,
  suffix,
  className = '',
  // Read rather than only forwarded: the visible border and label live on
  // wrapper elements, so the browser's own disabled styling never reaches them
  // and a disabled field would otherwise look identical to an editable one.
  disabled,
  ...rest
}: InputProps): React.JSX.Element {
  // `useId` produces a stable identifier across server and client renders,
  // which avoids a hydration mismatch.
  const generatedId = useId();
  const inputId = `input-${generatedId}`;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  const hasError = Boolean(error);

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className={`mb-1.5 block text-sm font-medium ${disabled ? 'text-subtle' : 'text-muted'}`}
        >
          {label}
        </label>
      )}

      <div
        className={`flex items-center rounded-lg border transition-colors focus-within:border-brand ${
          disabled
            ? // Three signals rather than opacity alone, which reads as "loading":
              // no hover affordance, a flatter surface, and a dashed edge.
              'cursor-not-allowed border-dashed border-border/60 bg-surface-raised/30'
            : hasError
              ? 'border-danger/60 bg-surface'
              : 'border-border bg-surface hover:border-border-strong'
        }`}
      >
        {prefix && (
          <span className="select-none pl-3 text-sm text-subtle" aria-hidden="true">
            {prefix}
          </span>
        )}

        <input
          id={inputId}
          // Announces the field as invalid to screen readers, not just visually.
          aria-invalid={hasError || undefined}
          // Points assistive tech at whichever message is currently shown.
          aria-describedby={hasError ? errorId : hint ? hintId : undefined}
          disabled={disabled}
          className={`w-full bg-transparent px-3 py-2.5 text-sm text-content placeholder:text-subtle focus:outline-none disabled:cursor-not-allowed disabled:text-subtle disabled:placeholder:text-subtle/60 ${className}`}
          {...rest}
        />

        {suffix && <span className="shrink-0 pr-3">{suffix}</span>}
      </div>

      {hasError ? (
        // `role="alert"` makes the message announced the moment it appears.
        <p id={errorId} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-sm text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
