'use client';

import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Loader2 } from 'lucide-react';
import type {
  FormulaDefinition,
  FormulaParameters,
  FormulaPreviewResult,
  KPIMetricKey,
} from '@qod/shared';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePreviewKPIFormula } from '@/lib/api/hooks';
import { cn } from '@/lib/utils/cn';

interface Props {
  projectId: string;
  definition: FormulaDefinition;
  parameters: FormulaParameters;
  expression: string | null;
}

export function LivePreviewPanel({ projectId, definition, parameters, expression }: Props) {
  const previewMutation = usePreviewKPIFormula(projectId);
  const [result, setResult] = useState<FormulaPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Debounce: only fire 500ms after edits settle.
  useEffect(() => {
    setError(null);
    const handle = setTimeout(() => {
      previewMutation.mutate(
        { metric: definition.metric as KPIMetricKey, parameters, expression },
        {
          onSuccess: (data) => setResult(data),
          onError: (err) => setError(err instanceof Error ? err.message : 'Preview failed'),
        },
      );
    }, 500);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definition.metric, JSON.stringify(parameters), expression]);

  const isLoading = previewMutation.isPending && !result;

  return (
    <Card padding="md" className="border-qod-accent/20 bg-qod-accent/5">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-secondary">Live preview</p>
          {definition.direction === 'higher' ? (
            <Badge variant="success">
              <span className="flex items-center gap-0.5">
                <ArrowUpRight className="h-3 w-3" />
                <span>Higher is better</span>
              </span>
            </Badge>
          ) : (
            <Badge variant="info">
              <span className="flex items-center gap-0.5">
                <ArrowDownRight className="h-3 w-3" />
                <span>Lower is better</span>
              </span>
            </Badge>
          )}
        </div>

        <div className="flex items-end gap-3">
          <span
            className={cn(
              'font-mono text-3xl font-semibold tabular-nums text-primary',
              isLoading && 'opacity-40',
            )}
          >
            {result ? formatValue(result.value, definition.unit) : '—'}
          </span>
          <span className="pb-1 text-xs text-muted">{definition.unit}</span>
          {isLoading && <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted" />}
        </div>

        {error && (
          <p className="text-xs text-rag-red">Preview error: {error}</p>
        )}

        {result?.breakdown && Object.keys(result.breakdown).length > 0 && (
          <div className="border-t border-qod-border/50 pt-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Inputs</p>
            <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {Object.entries(result.breakdown).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className="font-mono text-secondary tabular-nums">
                    {Number.isInteger(v) ? v : v.toFixed(2)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </Card>
  );
}

function formatValue(value: number, unit: string): string {
  if (!Number.isFinite(value)) return '—';
  if (unit === '%' || unit === 'score') return value.toFixed(1);
  if (unit === 'hours') return value.toFixed(1);
  if (unit === 'runs/day') return value.toFixed(2);
  return value.toFixed(2);
}
