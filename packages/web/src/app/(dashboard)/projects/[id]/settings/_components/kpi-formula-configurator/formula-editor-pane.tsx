'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Info, RotateCcw, Save } from 'lucide-react';
import type {
  FormulaDefinition,
  FormulaParameters,
  KPIMetricKey,
  ResolvedFormulaConfig,
} from '@qod/shared';
import { defaultParameters } from '@qod/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useResetKPIFormula, useUpsertKPIFormula } from '@/lib/api/hooks';
import { cn } from '@/lib/utils/cn';
import { ExpressionEditor } from './expression-editor';
import { LivePreviewPanel } from './live-preview-panel';
import { ParameterField } from './parameter-fields';

interface Props {
  projectId: string;
  definition: FormulaDefinition;
  config: ResolvedFormulaConfig;
  readOnly: boolean;
}

export function FormulaEditorPane({ projectId, definition, config, readOnly }: Props) {
  const [parameters, setParameters] = useState<FormulaParameters>(() => ({ ...config.parameters }));
  const [expression, setExpression] = useState<string>(() => config.expression ?? definition.defaultExpression ?? '');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const upsertMutation = useUpsertKPIFormula(projectId);
  const resetMutation = useResetKPIFormula(projectId);

  // Reset local edits whenever the user switches metrics or the upstream config refreshes.
  useEffect(() => {
    setParameters({ ...config.parameters });
    setExpression(config.expression ?? definition.defaultExpression ?? '');
    setSavedAt(null);
    setSaveError(null);
  }, [config, definition]);

  const isDirty = useMemo(() => {
    if (JSON.stringify(parameters) !== JSON.stringify(config.parameters)) return true;
    const baseExpression = config.expression ?? definition.defaultExpression ?? '';
    if (definition.expressionEditable && expression.trim() !== baseExpression.trim()) return true;
    return false;
  }, [parameters, expression, config, definition]);

  function handleParamChange(name: string, value: unknown) {
    setParameters((prev) => ({ ...prev, [name]: value }));
    setSavedAt(null);
  }

  async function handleSave() {
    setSaveError(null);
    try {
      await upsertMutation.mutateAsync({
        metric: definition.metric as KPIMetricKey,
        parameters,
        expression: definition.expressionEditable ? expression : null,
      });
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function handleReset() {
    setSaveError(null);
    try {
      const result = await resetMutation.mutateAsync(definition.metric as KPIMetricKey);
      setParameters({ ...result.parameters });
      setExpression(result.expression ?? definition.defaultExpression ?? '');
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Reset failed');
    }
  }

  function handleRevertLocal() {
    setParameters({ ...config.parameters });
    setExpression(config.expression ?? definition.defaultExpression ?? '');
    setSavedAt(null);
    setSaveError(null);
  }

  function handleApplyDefaults() {
    setParameters(defaultParameters(definition.metric as KPIMetricKey));
    setExpression(definition.defaultExpression ?? '');
    setSavedAt(null);
  }

  const saving = upsertMutation.isPending || resetMutation.isPending;

  return (
    <div className="space-y-4">
      <Card padding="lg">
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-primary">{definition.label}</h3>
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
                {config.isCustomized && <Badge variant="demo">Customized</Badge>}
              </div>
              <p className="mt-1 max-w-2xl text-sm text-secondary">{definition.description}</p>
            </div>
            <div className="flex items-center gap-2">
              {isDirty && !readOnly && (
                <button
                  type="button"
                  onClick={handleRevertLocal}
                  className="text-xs text-muted hover:text-primary"
                >
                  Discard changes
                </button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleApplyDefaults}
                disabled={readOnly || saving}
                title="Reset the form fields to registry defaults (without saving)"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Defaults
              </Button>
              {config.isCustomized && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleReset}
                  disabled={readOnly || saving}
                  title="Delete the override row so the registry default applies again"
                >
                  Reset to default
                </Button>
              )}
              <Button size="sm" onClick={handleSave} disabled={readOnly || saving || !isDirty}>
                <Save className="h-3.5 w-3.5" />
                {savedAt && Date.now() - savedAt < 2500 ? 'Saved!' : 'Save formula'}
              </Button>
            </div>
          </div>

          {saveError && (
            <Card padding="sm" className="border-rag-red/30 bg-rag-red/5">
              <p className="text-xs text-rag-red">{saveError}</p>
            </Card>
          )}

          {/* Formula display */}
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Formula</p>
            {definition.expressionEditable ? (
              <ExpressionEditor
                definition={definition}
                value={expression}
                onChange={(v) => {
                  setExpression(v);
                  setSavedAt(null);
                }}
                disabled={readOnly}
              />
            ) : (
              <div className="rounded-md border border-qod-border bg-qod-bg px-4 py-3 font-mono text-sm text-primary">
                {definition.formulaText}
              </div>
            )}
          </div>

          {/* Filters: SQL/query knobs that scope which records produce the
              expression's variables. Distinct from the expression's own
              variables, which appear inside the expression editor above. */}
          {definition.variables.length > 0 && (
            <div className="space-y-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Filters</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  Scope the data that produces the variables in the expression above.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {definition.variables.map((spec) => (
                  <div key={spec.name} className="space-y-1.5">
                    <label className="block text-xs font-medium text-primary">
                      {spec.label}
                    </label>
                    {spec.description && (
                      <p className="text-[11px] text-muted">{spec.description}</p>
                    )}
                    <div className={cn(readOnly && 'pointer-events-none opacity-60')}>
                      <ParameterField
                        spec={spec}
                        value={parameters[spec.name] ?? spec.defaultValue}
                        onChange={(v) => handleParamChange(spec.name, v)}
                        disabled={readOnly}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {definition.howItWorks && (
            <div className="flex items-start gap-2 rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2.5">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" />
              <p className="text-xs text-secondary">{definition.howItWorks}</p>
            </div>
          )}
        </div>
      </Card>

      <LivePreviewPanel
        projectId={projectId}
        definition={definition}
        parameters={parameters}
        expression={definition.expressionEditable ? expression : null}
      />
    </div>
  );
}
