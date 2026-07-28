'use client';

/**
 * One-click copy button.
 *
 * The task calls for making the shortened URL easy to copy, so this is a
 * first-class, reusable component rather than an inline handler: it appears on
 * the success card, in the link list and on the analytics page, behaving
 * identically in all three.
 */

import { Button, type ButtonSize, type ButtonVariant } from './Button';
import { useClipboard } from '../../hooks/useClipboard';

export interface CopyButtonProps {
  /** Text placed on the clipboard. */
  value: string;
  /** Label shown in the idle state. Defaults to `Copy`. */
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  /** Called after a successful copy, e.g. to raise a toast. */
  onCopied?: () => void;
}

/**
 * Renders a button that copies `value` and confirms it did.
 *
 * @param props Copy target and styling.
 * @returns The button element.
 *
 * @example
 * <CopyButton value={link.shortUrl} onCopied={() => showSuccess('Copied!')} />
 */
export function CopyButton({
  value,
  label = 'Copy',
  variant = 'secondary',
  size = 'md',
  className = '',
  onCopied,
}: CopyButtonProps): React.JSX.Element {
  const { copy, copied } = useClipboard();

  /** Copies the value and notifies the parent on success. */
  const handleClick = async (): Promise<void> => {
    const succeeded = await copy(value);
    if (succeeded) onCopied?.();
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={handleClick}
      // The label changes to "Copied!", so an explicit accessible name keeps
      // the control's purpose stable for screen-reader users.
      aria-label={copied ? 'Copied to clipboard' : `Copy ${value} to clipboard`}
      icon={copied ? <CheckIcon /> : <ClipboardIcon />}
    >
      {copied ? 'Copied!' : label}
    </Button>
  );
}

/** Clipboard glyph shown in the idle state. */
function ClipboardIcon(): React.JSX.Element {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

/** Tick glyph shown briefly after a successful copy. */
function CheckIcon(): React.JSX.Element {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
