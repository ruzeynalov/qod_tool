'use client';

import { useState, type ReactNode } from 'react';
import { Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, DialogHeader, DialogTitle, DialogBody } from '@/components/ui/dialog';
import { cn } from '@/lib/utils/cn';

/**
 * Mobile-only "Filters" trigger + bottom Sheet wrapper.
 *
 * Pages render their existing filter row twice — once inside `<div className="hidden md:flex ...">`
 * (the desktop inline row) and once inside `<FilterSheet>...</FilterSheet>` (the mobile sheet).
 * Both consume the same form state, so applying filters in the sheet immediately reflects in the
 * URL/query state on close. The trigger is `md:hidden` so it does not appear on desktop.
 */
export function FilterSheet({
  triggerLabel = 'Filters',
  activeCount,
  onReset,
  className,
  children,
}: {
  triggerLabel?: string;
  activeCount?: number;
  onReset?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'md:hidden inline-flex h-10 items-center gap-2 rounded-md border border-qod-border bg-qod-surface px-3 text-sm font-medium text-secondary transition-colors hover:bg-qod-bg hover:text-primary',
          className,
        )}
      >
        <Filter className="h-4 w-4" />
        {triggerLabel}
        {activeCount && activeCount > 0 ? (
          <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-qod-accent px-1.5 text-[10px] font-semibold text-white">
            {activeCount}
          </span>
        ) : null}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} side="bottom" className="bg-qod-surface p-0">
        <DialogHeader onClose={() => setOpen(false)}>
          <DialogTitle>Filters</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">{children}</DialogBody>
        <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-qod-border bg-qod-surface px-4 py-3">
          {onReset ? (
            <button
              type="button"
              onClick={() => {
                onReset();
              }}
              className="rounded-md px-3 py-2 text-sm text-secondary hover:bg-qod-bg hover:text-primary"
            >
              Reset
            </button>
          ) : (
            <span aria-hidden="true" />
          )}
          {/* Filters apply live (the form controls inside this sheet mutate
              the page's filter state on every onChange), so this button is
              just a "Done" close affordance — naming it "Apply" would
              suggest a deferred commit step that doesn't exist. */}
          <Button onClick={() => setOpen(false)}>Done</Button>
        </div>
      </Sheet>
    </>
  );
}
