import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

const variantStyles = {
  primary:
    'bg-qod-accent hover:bg-qod-accent/80 text-white border-transparent',
  secondary:
    'bg-qod-border hover:bg-qod-border/80 text-primary border-qod-border',
  ghost:
    'bg-transparent hover:bg-qod-bg text-secondary border-transparent',
  danger:
    'bg-rag-red/15 hover:bg-rag-red/25 text-rag-red border-rag-red/30',
} as const;

const sizeStyles = {
  sm: 'px-2.5 py-1 text-xs rounded',
  md: 'px-4 py-2 text-sm rounded-md',
  lg: 'px-6 py-2.5 text-base rounded-lg',
} as const;

export type ButtonVariant = keyof typeof variantStyles;
export type ButtonSize = keyof typeof sizeStyles;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 border font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-qod-accent/50',
        variantStyles[variant],
        sizeStyles[size],
        disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
        className,
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
