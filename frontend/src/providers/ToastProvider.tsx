'use client';

/**
 * Toast notifications.
 *
 * Gives every screen a one-line way to confirm an action ("Link deleted") or
 * report a failure, without each component owning banner markup and timers.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/** Visual variants a toast can take. */
export type ToastVariant = 'success' | 'error' | 'info';

/** A single active toast. */
interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

/** Actions exposed by the toast context. */
interface ToastContextValue {
  /** Shows a toast. */
  showToast: (message: string, variant?: ToastVariant) => void;
  /** Shorthand for a success toast. */
  showSuccess: (message: string) => void;
  /** Shorthand for an error toast. */
  showError: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** How long a toast stays on screen. */
const TOAST_DURATION_MS = 3200;

/** Tailwind classes per variant. */
const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  error: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
};

/** Icon glyph per variant. */
const VARIANT_ICONS: Record<ToastVariant, string> = {
  success: '✓',
  error: '!',
  info: 'i',
};

/**
 * Provides toast notifications and renders the toast stack.
 *
 * @param props.children Subtree that can raise toasts.
 */
export function ToastProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // A ref, not state: bumping it must never trigger a render.
  const nextIdRef = useRef(0);

  const showToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = nextIdRef.current++;
    setToasts((current) => [...current, { id, message, variant }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, TOAST_DURATION_MS);
  }, []);

  const showSuccess = useCallback((message: string) => showToast(message, 'success'), [showToast]);
  const showError = useCallback((message: string) => showToast(message, 'error'), [showToast]);

  const value = useMemo(
    () => ({ showToast, showSuccess, showError }),
    [showToast, showSuccess, showError],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/*
        `aria-live="polite"` makes screen readers announce toasts as they
        appear; `pointer-events-none` on the stack keeps the (non-interactive)
        toasts from blocking clicks on the page beneath.
      */}
      <div
        className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-full max-w-sm flex-col gap-2"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`animate-toast-in flex items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${VARIANT_STYLES[toast.variant]}`}
          >
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-current/20 text-xs font-bold"
              aria-hidden="true"
            >
              {VARIANT_ICONS[toast.variant]}
            </span>
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Reads the toast context.
 *
 * @returns Functions for raising toasts.
 * @throws {Error} When used outside a {@link ToastProvider}.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a <ToastProvider>');
  }
  return context;
}
