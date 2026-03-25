import { cn } from '@/lib/utils/cn';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
  id?: string;
}

export function Select({
  options,
  value,
  onChange,
  placeholder,
  className,
  disabled = false,
  'aria-label': ariaLabel,
  id,
}: SelectProps) {
  return (
    <div className={cn('relative', className)}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={ariaLabel ?? placeholder}
        className={cn(
          'w-full appearance-none rounded-md border border-qod-border bg-qod-surface py-2 pl-3 pr-8 text-sm text-primary',
          'focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent',
          'transition-colors',
          disabled && 'opacity-50 cursor-not-allowed',
          !value && placeholder && 'text-muted',
        )}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
    </div>
  );
}
