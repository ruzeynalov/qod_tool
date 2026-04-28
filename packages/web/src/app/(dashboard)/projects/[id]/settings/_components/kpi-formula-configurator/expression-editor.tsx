'use client';

import { useMemo, useRef } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Parser } from 'expr-eval';
import type { FormulaDefinition } from '@qod/shared';
import { cn } from '@/lib/utils/cn';

const ALLOWED_FUNCTIONS = new Set(['min', 'max', 'abs', 'round', 'floor', 'ceil', 'sqrt']);

interface Props {
  definition: FormulaDefinition;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function ExpressionEditor({ definition, value, onChange, disabled }: Props) {
  const allowed = useMemo(
    () => new Set(definition.expressionVariables ?? []),
    [definition.expressionVariables],
  );
  const ref = useRef<HTMLTextAreaElement>(null);

  const validation = useMemo(() => validateExpression(value, allowed), [value, allowed]);

  function insertAtCursor(token: string) {
    if (disabled) return;
    const ta = ref.current;
    if (!ta) {
      onChange(value + token);
      return;
    }
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const next = `${before}${token}${after}`;
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + token.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="space-y-2">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        spellCheck={false}
        disabled={disabled}
        className={cn(
          'w-full rounded-md border bg-qod-bg px-3 py-2 font-mono text-sm text-primary focus:outline-none focus:ring-1 disabled:opacity-60',
          validation.ok
            ? 'border-qod-border focus:ring-qod-accent focus:border-qod-accent'
            : 'border-rag-red/40 focus:ring-rag-red/40 focus:border-rag-red/40',
        )}
      />
      <div className="flex items-center justify-between text-xs">
        {validation.ok ? (
          <span className="inline-flex items-center gap-1 text-rag-green">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Valid expression</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-rag-red">
            <XCircle className="h-3.5 w-3.5" />
            <span>{validation.error}</span>
          </span>
        )}
        <button
          type="button"
          onClick={() => onChange(definition.defaultExpression ?? '')}
          disabled={disabled}
          className="rounded px-2 py-0.5 text-[11px] text-muted hover:bg-qod-bg hover:text-primary disabled:opacity-50"
        >
          Reset to default
        </button>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Variables (click to insert)</p>
        <div className="flex flex-wrap gap-1.5">
          {[...allowed].map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => insertAtCursor(name)}
              disabled={disabled}
              className="rounded-full border border-qod-border bg-qod-surface px-2 py-0.5 font-mono text-[11px] text-secondary hover:border-qod-accent/40 hover:text-primary disabled:opacity-60"
            >
              {name}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted">
          Allowed functions: <span className="font-mono">min · max · abs · round · sqrt · floor · ceil</span>
        </p>
      </div>
    </div>
  );
}

function validateExpression(
  expression: string,
  allowed: Set<string>,
): { ok: true } | { ok: false; error: string } {
  if (!expression.trim()) return { ok: false, error: 'Expression is empty' };
  let parsed;
  try {
    parsed = Parser.parse(expression);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Syntax error' };
  }
  for (const sym of parsed.symbols({ withMembers: false })) {
    if (allowed.has(sym)) continue;
    if (ALLOWED_FUNCTIONS.has(sym)) continue;
    return { ok: false, error: `Unknown identifier "${sym}"` };
  }
  // Probe-evaluate to surface runtime errors early.
  const probe: Record<string, number> = {};
  for (const v of allowed) probe[v] = 50;
  try {
    const result = parsed.evaluate(probe);
    if (typeof result !== 'number' || !Number.isFinite(result)) {
      return { ok: false, error: 'Expression must evaluate to a finite number' };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Evaluation failed' };
  }
  return { ok: true };
}
