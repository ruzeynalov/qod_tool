import { cn } from '@/lib/utils/cn';

const sizeStyles = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-3',
} as const;

export interface SpinnerProps {
  size?: keyof typeof sizeStyles;
  className?: string;
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <div
      className={cn(
        'animate-spin rounded-full border-qod-border border-t-qod-accent',
        sizeStyles[size],
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  );
}
