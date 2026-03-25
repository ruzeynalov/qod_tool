import { type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

const paddingVariants = {
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
} as const;

export interface CardProps {
  children: ReactNode;
  padding?: keyof typeof paddingVariants;
  className?: string;
}

export function Card({ children, padding = 'md', className }: CardProps) {
  return (
    <div
      className={cn(
        'bg-qod-surface border border-qod-border rounded-lg',
        paddingVariants[padding],
        className,
      )}
    >
      {children}
    </div>
  );
}
