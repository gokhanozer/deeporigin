'use client';

/**
 * Segmented control — a small set of mutually exclusive options.
 *
 * Extracted because this markup was about to exist in four places: the period
 * selectors on the dashboard and the per-link analytics page, and the
 * "All links / My links" scope switches on the link list and the dashboard.
 * Copy four is where the accessibility wiring quietly diverges.
 *
 * Generic over the option value, so it works for numbers (period days) and
 * string unions (scope) without casting.
 */

export interface SegmentedOption<T> {
  value: T;
  label: string;
}

export interface SegmentedToggleProps<T> {
  /** Available options, in display order. */
  options: readonly SegmentedOption<T>[];
  /** Currently selected value. */
  value: T;
  /** Called with the newly selected value. */
  onChange: (value: T) => void;
  /** Accessible name for the group — describes what is being switched. */
  ariaLabel: string;
  className?: string;
}

/**
 * Renders a segmented control.
 *
 * @param props Options, current value and change handler.
 * @returns The control element.
 *
 * @example
 * <SegmentedToggle
 *   options={ANALYTICS_PERIODS.map(p => ({ value: p.days, label: p.label }))}
 *   value={days}
 *   onChange={setDays}
 *   ariaLabel="Select time period"
 * />
 */
export function SegmentedToggle<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  className = '',
}: SegmentedToggleProps<T>): React.JSX.Element {
  return (
    <div
      // `role="group"` plus a label is what tells assistive technology these
      // buttons belong together and what they control.
      role="group"
      aria-label={ariaLabel}
      className={`flex shrink-0 rounded-lg border border-border bg-surface p-1 ${className}`}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            // Conveys the selected state to screen readers. Without it the
            // distinction would be colour-only, which is invisible to them.
            aria-pressed={selected}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              selected ? 'bg-surface-raised text-content' : 'text-muted hover:text-content'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
