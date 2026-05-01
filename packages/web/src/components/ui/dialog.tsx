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

// ---------------------------------------------------------------------------
// Module-level helpers — body scroll lock and inert background. Refcounted so
// stacked dialogs cooperate.
// ---------------------------------------------------------------------------

let scrollLockCount = 0;
function lockBodyScroll() {
  if (scrollLockCount === 0) document.documentElement.style.overflow = 'hidden';
  scrollLockCount += 1;
}
function unlockBodyScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) document.documentElement.style.overflow = '';
}

const inertCounts = new WeakMap<HTMLElement, number>();
const inertOriginals = new WeakMap<
  HTMLElement,
  { inert: boolean; ariaHidden: string | null }
>();

/**
 * Mark every direct child of <body> except the portal root as inert and
 * aria-hidden so screen readers and keyboard navigation can't reach background
 * content while a modal is open. Refcounted per-element so stacked dialogs
 * don't undo each other.
 */
function applyInertBackground(container: HTMLElement): HTMLElement[] {
  // Walk up to the direct child of <body> that contains the dialog. That's the
  // portal wrapper we mounted; everything else under <body> is background.
  let portalRoot: HTMLElement | null = container;
  while (portalRoot && portalRoot.parentElement !== document.body) {
    portalRoot = portalRoot.parentElement;
  }
  if (!portalRoot) return [];

  const siblings = Array.from(document.body.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el !== portalRoot,
  );
  for (const el of siblings) {
    const count = inertCounts.get(el) ?? 0;
    if (count === 0) {
      inertOriginals.set(el, {
        inert: el.inert,
        ariaHidden: el.getAttribute('aria-hidden'),
      });
      el.inert = true;
      el.setAttribute('aria-hidden', 'true');
    }
    inertCounts.set(el, count + 1);
  }
  return siblings;
}

function releaseInertBackground(siblings: HTMLElement[]) {
  for (const el of siblings) {
    const count = inertCounts.get(el) ?? 0;
    if (count <= 1) {
      inertCounts.delete(el);
      const orig = inertOriginals.get(el);
      if (orig) {
        el.inert = orig.inert;
        if (orig.ariaHidden === null) el.removeAttribute('aria-hidden');
        else el.setAttribute('aria-hidden', orig.ariaHidden);
        inertOriginals.delete(el);
      }
    } else {
      inertCounts.set(el, count - 1);
    }
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

// ---------------------------------------------------------------------------
// Shared shell hook used by both Dialog and Sheet.
// ---------------------------------------------------------------------------

function useDialogShell(open: boolean, onClose: () => void, closeOnEsc: boolean) {
  // SSR-safe gate: only mount the portal once we're on the client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const active = open && mounted;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const hasTitleRef = useRef(false);

  // Capture the element that had focus when the dialog opened.
  useLayoutEffect(() => {
    if (open) triggerRef.current = (document.activeElement as HTMLElement) ?? null;
  }, [open]);

  // Body scroll lock for the lifetime of the open state.
  useEffect(() => {
    if (!active) return;
    lockBodyScroll();
    return unlockBodyScroll;
  }, [active]);

  // Inert background, focus trap, initial focus, restore-on-close. All in one
  // effect so they share the lifetime — and so containerRef.current is
  // guaranteed to be attached because we only render the portal subtree (and
  // therefore the ref) when `active` is true, and useEffect runs after commit.
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const inertedSiblings = applyInertBackground(container);

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
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      releaseInertBackground(inertedSiblings);
      const trigger = triggerRef.current;
      if (trigger && document.contains(trigger) && typeof trigger.focus === 'function') {
        trigger.focus({ preventScroll: true });
      } else {
        if (trigger && process.env.NODE_ENV !== 'production') {

          console.warn(
            '[Dialog] Trigger element unmounted while dialog was open; focus not restored.',
          );
        }
      }
    };
  }, [active, onClose, closeOnEsc]);

  // Dev-only warning if no DialogTitle was rendered (after first paint).
  useEffect(() => {
    if (!active) return;
    if (process.env.NODE_ENV === 'production') return;
    const id = window.setTimeout(() => {
      if (!hasTitleRef.current) {

        console.warn(
          '[Dialog] No <DialogTitle> rendered. Dialogs should provide an accessible title for screen readers.',
        );
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [active]);

  const ctx = useMemo<DialogContextValue>(
    () => ({
      titleId,
      descriptionId,
      registerTitle: () => {
        hasTitleRef.current = true;
      },
      registerDescription: () => {
        // Tracked for parity with title; no warning attached.
      },
    }),
    [titleId, descriptionId],
  );

  return { containerRef, ctx, active };
}

// ---------------------------------------------------------------------------
// Public components
// ---------------------------------------------------------------------------

export function Dialog({
  open,
  onClose,
  children,
  className,
  closeOnBackdrop = true,
  closeOnEsc = true,
  ariaLabel,
}: DialogProps) {
  const { containerRef, ctx, active } = useDialogShell(open, onClose, closeOnEsc);
  if (!active) return null;
  return createPortal(
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
    </div>,
    document.body,
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
  const { containerRef, ctx, active } = useDialogShell(open, onClose, closeOnEsc);
  if (!active) return null;

  const sideClasses: Record<SheetSide, string> = {
    bottom:
      'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-t border-qod-border',
    left: 'inset-y-0 left-0 h-full w-72 max-w-[85vw] border-r border-qod-border',
    right: 'inset-y-0 right-0 h-full w-72 max-w-[85vw] border-l border-qod-border',
  };

  return createPortal(
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
    </div>,
    document.body,
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
