import { type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

const variantStyles = {
  success: 'bg-rag-green/15 text-rag-green border-rag-green/30',
  warning: 'bg-rag-amber/15 text-rag-amber border-rag-amber/30',
  error: 'bg-rag-red/15 text-rag-red border-rag-red/30',
  info: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  neutral: 'bg-qod-border/50 text-secondary border-qod-border',
  demo: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
} as const;

export type BadgeVariant = keyof typeof variantStyles;

export interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ children, variant = 'neutral', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
