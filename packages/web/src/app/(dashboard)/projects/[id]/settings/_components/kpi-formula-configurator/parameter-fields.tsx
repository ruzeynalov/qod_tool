'use client';

import { X } from 'lucide-react';
import type { FormulaVariableSpec } from '@qod/shared';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils/cn';

interface FieldProps<T> {
  spec: FormulaVariableSpec;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

export function ParameterField({
  spec,
  value,
  onChange,
  disabled,
}: {
  spec: FormulaVariableSpec;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  switch (spec.kind) {
    case 'window':
    case 'integer':
      return (
        <NumberField
          spec={spec}
          value={typeof value === 'number' ? value : Number(spec.defaultValue)}
          onChange={onChange as (v: number) => void}
          disabled={disabled}
        />
      );
    case 'boolean':
      return (
        <BooleanField
          spec={spec}
          value={typeof value === 'boolean' ? value : Boolean(spec.defaultValue)}
          onChange={onChange as (v: boolean) => void}
          disabled={disabled}
        />
      );
    case 'enum':
      return (
        <EnumField
          spec={spec}
          value={typeof value === 'string' ? value : String(spec.defaultValue)}
          onChange={onChange as (v: string) => void}
          disabled={disabled}
        />
      );
    case 'statusSet':
    case 'severitySet':
      return (
        <ChipMultiSelect
          spec={spec}
          value={Array.isArray(value) ? (value as string[]) : (spec.defaultValue as string[])}
          onChange={onChange as (v: string[]) => void}
          disabled={disabled}
        />
      );
    case 'regex':
      return (
        <RegexField
          spec={spec}
          value={typeof value === 'string' ? value : String(spec.defaultValue)}
          onChange={onChange as (v: string) => void}
          disabled={disabled}
        />
      );
  }
}

function NumberField({ spec, value, onChange, disabled }: FieldProps<number>) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={Number.isFinite(value) ? value : ''}
        min={spec.min}
        max={spec.max}
        step="1"
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value === '' ? Number(spec.defaultValue) : parseInt(e.target.value, 10);
          if (Number.isFinite(next)) onChange(next);
        }}
        className="w-24 rounded border border-qod-border bg-qod-surface px-2 py-1 text-right text-sm font-mono text-primary focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent disabled:opacity-60"
      />
      {spec.unit && <span className="text-xs text-muted">{spec.unit}</span>}
    </div>
  );
}

function BooleanField({ spec, value, onChange, disabled }: FieldProps<boolean>) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 rounded border border-qod-border bg-qod-surface text-qod-accent focus:ring-qod-accent disabled:opacity-60"
      />
      <span className="text-xs text-secondary">{value ? 'Enabled' : 'Disabled'}</span>
    </label>
  );
}

function EnumField({ spec, value, onChange, disabled }: FieldProps<string>) {
  return (
    <Select
      value={value}
      onChange={(v) => onChange(v)}
      disabled={disabled}
      options={(spec.enumOptions ?? []).map((opt) => ({ value: opt, label: opt }))}
    />
  );
}

function ChipMultiSelect({ spec, value, onChange, disabled }: FieldProps<string[]>) {
  const selected = new Set(value);
  const options = spec.enumOptions ?? [];

  function toggle(opt: string) {
    if (disabled) return;
    if (selected.has(opt)) {
      const next = value.filter((v) => v !== opt);
      if (next.length > 0) onChange(next);
    } else {
      onChange([...value, opt]);
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const isOn = selected.has(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            disabled={disabled}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors',
              isOn
                ? 'border-qod-accent/40 bg-qod-accent/15 text-primary'
                : 'border-qod-border bg-qod-surface text-secondary hover:border-qod-accent/30 hover:text-primary',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <span>{opt}</span>
            {isOn && <X className="h-3 w-3 opacity-70" />}
          </button>
        );
      })}
    </div>
  );
}

function RegexField({ spec, value, onChange, disabled }: FieldProps<string>) {
  let validationError: string | null = null;
  try {
    new RegExp(value);
  } catch (err) {
    validationError = err instanceof Error ? err.message : 'Invalid regex';
  }

  // Quick demo of what the pattern matches against a sample.
  let preview = '';
  if (!validationError) {
    try {
      const matches = 'PS-123 fixed in JIRA-456 (relates ABC-7)'.match(new RegExp(value, 'g'));
      preview = matches ? matches.join('  ·  ') : '(no matches in sample)';
    } catch {
      preview = '';
    }
  }

  void spec;
  return (
    <div className="space-y-1">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        spellCheck={false}
        className={cn(
          'w-full rounded border bg-qod-surface px-2 py-1 font-mono text-xs text-primary focus:outline-none focus:ring-1 disabled:opacity-60',
          validationError
            ? 'border-rag-red/40 focus:ring-rag-red/40 focus:border-rag-red/40'
            : 'border-qod-border focus:ring-qod-accent focus:border-qod-accent',
        )}
      />
      {validationError ? (
        <p className="text-[11px] text-rag-red">Invalid regex: {validationError}</p>
      ) : (
        <p className="truncate text-[11px] text-muted">
          Sample matches: <span className="font-mono text-secondary">{preview}</span>
        </p>
      )}
    </div>
  );
}
