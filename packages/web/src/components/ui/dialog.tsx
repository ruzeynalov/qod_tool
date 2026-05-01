'use client';

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type SheetSide = 'bottom' | 'left' | 'right';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  ariaLabel?: string;
}

export interface SheetProps extends DialogProps {
  side?: SheetSide;
}

interface DialogContextValue {
  titleId: string;
  descriptionId: string;
  registerTitle: () => void;
  registerDescription: () => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

let lockCount = 0;
function lockBodyScroll() {
  if (lockCount === 0) {
    document.documentElement.style.overflow = 'hidden';
  }
  lockCount += 1;
}
function unlockBodyScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.documentElement.style.overflow = '';
  }
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('inert') && el.offsetParent !== null,
  );
}

function useDialogShell(open: boolean, onClose: () => void, closeOnEsc: boolean) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const hasTitleRef = useRef(false);
  const hasDescriptionRef = useRef(false);

  // Capture the element that had focus when the dialog opened, so we can restore later.
  useLayoutEffect(() => {
    if (open) {
      triggerRef.current = (document.activeElement as HTMLElement) ?? null;
    }
  }, [open]);

  // Body scroll lock for the lifetime of the open state.
  useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    return unlockBodyScroll;
  }, [open]);

  // Initial focus + focus trap + restoration.
  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;

    const initial =
      container.querySelector<HTMLElement>('[data-autofocus]') ??
      getFocusable(container)[0] ??
      container;
    initial.focus({ preventScroll: true });

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && closeOnEsc) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = getFocusable(container!);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      const trigger = triggerRef.current;
      if (trigger && document.contains(trigger) && typeof trigger.focus === 'function') {
        trigger.focus({ preventScroll: true });
      } else {
        if (trigger && process.env.NODE_ENV !== 'production') {

          console.warn('[Dialog] Trigger element unmounted while dialog was open; focus not restored.');
        }
        // Fall back to body so focus does not get trapped on the removed portal.
        (document.body as HTMLElement).focus?.({ preventScroll: true });
      }
    };
  }, [open, onClose, closeOnEsc]);

  // Dev-only warning if no DialogTitle was rendered (after first paint).
  useEffect(() => {
    if (!open) return;
    if (process.env.NODE_ENV === 'production') return;
    const id = window.setTimeout(() => {
      if (!hasTitleRef.current) {

        console.warn(
          '[Dialog] No <DialogTitle> rendered. Dialogs should provide an accessible title for screen readers.',
        );
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const ctx = useMemo<DialogContextValue>(
    () => ({
      titleId,
      descriptionId,
      registerTitle: () => {
        hasTitleRef.current = true;
      },
      registerDescription: () => {
        hasDescriptionRef.current = true;
      },
    }),
    [titleId, descriptionId],
  );

  return { containerRef, ctx };
}

function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

export function Dialog({
  open,
  onClose,
  children,
  className,
  closeOnBackdrop = true,
  closeOnEsc = true,
  ariaLabel,
}: DialogProps) {
  const { containerRef, ctx } = useDialogShell(open, onClose, closeOnEsc);
  if (!open) return null;
  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4"
        onMouseDown={(e) => {
          if (closeOnBackdrop && e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={ctx.titleId}
          aria-describedby={ctx.descriptionId}
          aria-label={ariaLabel}
          tabIndex={-1}
          className={cn(
            'w-full max-w-lg max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-lg border border-qod-border bg-qod-surface shadow-2xl outline-none',
            className,
          )}
        >
          <DialogContext.Provider value={ctx}>{children}</DialogContext.Provider>
        </div>
      </div>
    </Portal>
  );
}

export function Sheet({
  open,
  onClose,
  children,
  className,
  side = 'bottom',
  closeOnBackdrop = true,
  closeOnEsc = true,
  ariaLabel,
}: SheetProps) {
  const { containerRef, ctx } = useDialogShell(open, onClose, closeOnEsc);
  if (!open) return null;

  const sideClasses: Record<SheetSide, string> = {
    bottom:
      'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-t border-qod-border',
    left: 'inset-y-0 left-0 h-full w-72 max-w-[85vw] border-r border-qod-border',
    right: 'inset-y-0 right-0 h-full w-72 max-w-[85vw] border-l border-qod-border',
  };

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onMouseDown={(e) => {
          if (closeOnBackdrop && e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={ctx.titleId}
          aria-describedby={ctx.descriptionId}
          aria-label={ariaLabel}
          tabIndex={-1}
          className={cn(
            'fixed bg-qod-surface shadow-2xl outline-none overflow-y-auto',
            sideClasses[side],
            className,
          )}
        >
          <DialogContext.Provider value={ctx}>{children}</DialogContext.Provider>
        </div>
      </div>
    </Portal>
  );
}

export function DialogHeader({
  children,
  onClose,
  className,
}: {
  children: ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between border-b border-qod-border px-4 py-3',
        className,
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ml-2 rounded p-1 text-muted hover:bg-qod-bg hover:text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function DialogTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ctx = useContext(DialogContext);
  const register = ctx?.registerTitle;
  useEffect(() => {
    register?.();
  }, [register]);
  return (
    <h2
      id={ctx?.titleId}
      className={cn('text-sm font-semibold text-primary', className)}
    >
      {children}
    </h2>
  );
}

export function DialogDescription({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ctx = useContext(DialogContext);
  const register = ctx?.registerDescription;
  useEffect(() => {
    register?.();
  }, [register]);
  return (
    <p id={ctx?.descriptionId} className={cn('text-xs text-muted', className)}>
      {children}
    </p>
  );
}

export function DialogBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('px-4 py-4', className)}>{children}</div>;
}
