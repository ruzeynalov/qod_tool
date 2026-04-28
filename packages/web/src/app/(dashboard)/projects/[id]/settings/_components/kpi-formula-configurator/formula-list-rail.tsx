'use client';

import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bug,
  CheckCircle2,
} from 'lucide-react';
import type { FormulaDefinition, KPIMetricKey, ResolvedFormulaConfig } from '@qod/shared';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';

interface Props {
  definitions: FormulaDefinition[];
  configs: Map<KPIMetricKey, ResolvedFormulaConfig>;
  selected: KPIMetricKey;
  onSelect: (metric: KPIMetricKey) => void;
}

const CATEGORY_ORDER: Array<{ key: 'testing' | 'defect' | 'composite'; label: string; icon: JSX.Element }> = [
  { key: 'testing', label: 'Testing', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  { key: 'defect', label: 'Defects', icon: <Bug className="h-3.5 w-3.5" /> },
  { key: 'composite', label: 'Composite', icon: <BarChart3 className="h-3.5 w-3.5" /> },
];

export function FormulaListRail({ definitions, configs, selected, onSelect }: Props) {
  const grouped = new Map<string, FormulaDefinition[]>();
  for (const d of definitions) {
    const list = grouped.get(d.category) ?? [];
    list.push(d);
    grouped.set(d.category, list);
  }

  return (
    <Card padding="sm" className="h-fit">
      <div className="space-y-4">
        {CATEGORY_ORDER.map(({ key, label, icon }) => {
          const items = grouped.get(key) ?? [];
          if (items.length === 0) return null;
          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center gap-2 px-2 pt-1 text-[11px] font-medium uppercase tracking-wider text-muted">
                <span className="text-secondary">{icon}</span>
                <span>{label}</span>
              </div>
              <ul className="space-y-0.5">
                {items.map((def) => {
                  const isSelected = def.metric === selected;
                  const cfg = configs.get(def.metric as KPIMetricKey);
                  const customized = cfg?.isCustomized;
                  return (
                    <li key={def.metric}>
                      <button
                        type="button"
                        onClick={() => onSelect(def.metric as KPIMetricKey)}
                        className={cn(
                          'group flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors',
                          isSelected
                            ? 'border-qod-accent/40 bg-qod-accent/10 text-primary'
                            : 'border-transparent text-secondary hover:bg-qod-bg/60 hover:text-primary',
                        )}
                      >
                        <DirectionIcon direction={def.direction} />
                        <span className="flex-1 truncate">{def.label}</span>
                        {customized && (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-qod-accent"
                            title="Customized"
                            aria-label="Customized"
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function DirectionIcon({ direction }: { direction: 'higher' | 'lower' }) {
  if (direction === 'higher') {
    return <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-rag-green" aria-label="Higher is better" />;
  }
  return <ArrowDownRight className="h-3.5 w-3.5 shrink-0 text-blue-400" aria-label="Lower is better" />;
}
