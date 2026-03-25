import { type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 px-4 text-center', className)}>
      {icon && (
        <div className="mb-4 text-muted">{icon}</div>
      )}
      <h3 className="text-lg font-medium text-primary">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-secondary max-w-sm">{description}</p>
      )}
      {action && (
        <div className="mt-4">{action}</div>
      )}
    </div>
  );
}
