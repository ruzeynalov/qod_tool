'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils/cn';
import { Search, X } from 'lucide-react';

export interface SearchInputProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
}

export function SearchInput({
  value: controlledValue,
  onChange,
  placeholder = 'Search...',
  debounceMs = 300,
  className,
}: SearchInputProps) {
  const [internalValue, setInternalValue] = useState(controlledValue ?? '');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track last value we sent to the parent so we can distinguish
  // external changes from echoed-back debounced values.
  const lastEmittedRef = useRef(controlledValue ?? '');

  // Sync from parent only for *external* changes (e.g., programmatic reset),
  // not for our own debounced value echoing back.
  useEffect(() => {
    if (controlledValue !== undefined && controlledValue !== lastEmittedRef.current) {
      setInternalValue(controlledValue);
      lastEmittedRef.current = controlledValue;
    }
  }, [controlledValue]);

  const debouncedOnChange = useCallback(
    (val: string) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        lastEmittedRef.current = val;
        onChange(val);
      }, debounceMs);
    },
    [onChange, debounceMs],
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInternalValue(val);
    debouncedOnChange(val);
  };

  const handleClear = () => {
    setInternalValue('');
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    lastEmittedRef.current = '';
    onChange('');
  };

  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
      <input
        type="text"
        value={internalValue}
        onChange={handleChange}
        placeholder={placeholder}
        className={cn(
          // text-base on <sm prevents iOS Safari zoom-on-focus
          'w-full rounded-md border border-qod-border bg-qod-surface py-2 pl-9 pr-8 text-base text-primary sm:text-sm placeholder:text-muted',
          'focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent',
          'transition-colors',
        )}
      />
      {internalValue && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-primary transition-colors"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
