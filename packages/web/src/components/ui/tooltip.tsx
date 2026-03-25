import { type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export interface TooltipProps {
  text: string;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

const positionStyles = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
} as const;

export function Tooltip({ text, children, position = 'top', className }: TooltipProps) {
  return (
    <div className={cn('relative inline-flex group', className)}>
      {children}
      <div
        className={cn(
          'absolute z-50 hidden group-hover:block',
          'whitespace-nowrap rounded bg-qod-surface px-2 py-1 text-xs text-primary shadow-lg border border-qod-border',
          'pointer-events-none',
          positionStyles[position],
        )}
        role="tooltip"
      >
        {text}
      </div>
    </div>
  );
}
