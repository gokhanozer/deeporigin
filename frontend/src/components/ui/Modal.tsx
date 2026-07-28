'use client';

/**
 * Accessible modal dialog.
 *
 * Built on the native `<dialog>` element, which gives focus trapping, Escape to
 * close, the top layer and `aria-modal` semantics for free — all of which are
 * easy to get wrong in a hand-rolled implementation.
 */

import { useEffect, useRef, type ReactNode } from 'react';

export interface ModalProps {
  /** Whether the dialog is visible. */
  open: boolean;
  /** Called on Escape, backdrop click or the close button. */
  onClose: () => void;
  /** Dialog heading, wired up as the accessible name. */
  title: string;
  /** Optional supporting line beneath the title. */
  description?: string;
  children: ReactNode;
  /** Footer actions, right-aligned. */
  footer?: ReactNode;
}

/**
 * Renders a modal dialog.
 *
 * @param props Dialog state and content.
 * @returns The dialog element.
 *
 * @example
 * <Modal open={editing} onClose={close} title="Edit slug" footer={<Button…/>}>…</Modal>
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: ModalProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Keep the DOM element's open state in step with the `open` prop.
  // `showModal()` (not `show()`) is what makes the dialog modal: it traps focus
  // and renders the ::backdrop.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // The browser fires `cancel` for Escape. Prevent the default close so React
  // state stays the single source of truth for whether the dialog is open.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (event: Event): void => {
      event.preventDefault();
      onClose();
    };

    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onClose]);

  /**
   * Closes the dialog when the backdrop — but not the panel — is clicked.
   *
   * A click on the `<dialog>` itself lands on the backdrop, because the panel
   * inside it stops the event from reaching this handler.
   *
   * @param event The click event.
   */
  const handleBackdropClick = (event: React.MouseEvent<HTMLDialogElement>): void => {
    if (event.target === dialogRef.current) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      aria-labelledby="modal-title"
      className="m-auto w-full max-w-md rounded-card border border-border bg-surface p-0 text-content backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      {/* Stops clicks inside the panel from reaching the backdrop handler. */}
      <div className="p-5" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4">
          <h2 id="modal-title" className="text-base font-semibold text-content">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-subtle">{description}</p>}
        </div>

        <div>{children}</div>

        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </dialog>
  );
}
