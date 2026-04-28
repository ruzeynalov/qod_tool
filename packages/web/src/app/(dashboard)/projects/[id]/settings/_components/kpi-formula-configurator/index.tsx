'use client';

import { useEffect, useMemo, useState } from 'react';
import { Info, ShieldAlert } from 'lucide-react';
import type {
  FormulaDefinition,
  KPIMetricKey,
  ResolvedFormulaConfig,
} from '@qod/shared';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useKPIFormulas } from '@/lib/api/hooks';
import { FormulaListRail } from './formula-list-rail';
import { FormulaEditorPane } from './formula-editor-pane';

interface Props {
  projectId: string;
  /** When true, the editor renders read-only (demo mode or non-admin viewer). */
  readOnly: boolean;
  readOnlyReason?: string;
}

export function KPIFormulaConfigurator({ projectId, readOnly, readOnlyReason }: Props) {
  const { data, isLoading } = useKPIFormulas(projectId);
  const definitions = useMemo<FormulaDefinition[]>(() => data?.definitions ?? [], [data]);
  const configs = useMemo<ResolvedFormulaConfig[]>(() => data?.configs ?? [], [data]);

  const configMap = useMemo(() => {
    const m = new Map<KPIMetricKey, ResolvedFormulaConfig>();
    for (const c of configs) m.set(c.metric as KPIMetricKey, c);
    return m;
  }, [configs]);

  const [selectedMetric, setSelectedMetric] = useState<KPIMetricKey | null>(null);

  // Pick the first metric once data arrives; honor a previous selection
  // if the metric still exists in the new data.
  useEffect(() => {
    if (definitions.length === 0) return;
    if (selectedMetric && definitions.some((d) => d.metric === selectedMetric)) return;
    setSelectedMetric(definitions[0].metric);
  }, [definitions, selectedMetric]);

  if (isLoading || definitions.length === 0 || !selectedMetric) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-7 w-1/3" />
        <Skeleton className="h-[420px] w-full" />
      </div>
    );
  }

  const selectedDefinition = definitions.find((d) => d.metric === selectedMetric)!;
  const selectedConfig = configMap.get(selectedMetric)
    ?? { metric: selectedMetric, parameters: {}, expression: null, isCustomized: false, updatedAt: null, updatedById: null };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-primary">KPI Formula Configurator</h2>
          <p className="mt-0.5 text-xs text-muted">
            Tune how each quality metric is calculated. Defaults are applied until you save an override; history stays untouched and only future aggregations use the new config.
          </p>
        </div>
      </div>

      {readOnly && (
        <Card padding="sm" className="border-rag-amber/30 bg-rag-amber/5">
          <div className="flex items-start gap-3 text-xs">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rag-amber" />
            <div>
              <p className="font-medium text-primary">Read-only mode</p>
              <p className="mt-0.5 text-secondary">
                {readOnlyReason ?? 'You can browse the configurator and live-preview tweaks, but saving is disabled.'}
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <FormulaListRail
          definitions={definitions}
          configs={configMap}
          selected={selectedMetric}
          onSelect={setSelectedMetric}
        />
        <FormulaEditorPane
          key={selectedMetric}
          projectId={projectId}
          definition={selectedDefinition}
          config={selectedConfig}
          readOnly={readOnly}
        />
      </div>

      <Card padding="sm">
        <div className="flex items-start gap-3 text-xs text-secondary">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" />
          <div>
            <p className="font-medium text-primary">How saving works</p>
            <p className="mt-0.5">
              Saving a formula stores an override row scoped to this project. Existing
              <code className="mx-1 rounded bg-qod-bg px-1 py-0.5">KPISnapshot</code>
              rows are preserved; aggregation runs after the save use the new config.
              The KPI dashboard sparkline marks the change so you can visually
              correlate trend shifts with formula edits.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
