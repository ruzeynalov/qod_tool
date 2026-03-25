'use client';

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
  type TooltipProps,
} from 'recharts';
import { useChartColors } from '@/lib/hooks/use-chart-colors';

interface SeverityData {
  severity: string;
  count: number;
}

interface SeverityBreakdownProps {
  data: SeverityData[];
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#64748b',
};

function getColor(severity: string): string {
  return SEVERITY_COLORS[severity.toLowerCase()] ?? '#94a3b8';
}

interface LegendPayloadItem {
  value: string;
  color?: string;
  payload?: { count: number };
}

function CustomLegend({ payload }: { payload?: LegendPayloadItem[] }) {
  if (!payload) return null;

  return (
    <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1">
      {payload.map((entry) => (
        <li key={entry.value} className="flex items-center gap-1.5 text-xs">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted">
            {entry.value}{' '}
            <span className="font-medium text-primary">
              ({entry.payload?.count ?? 0})
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SeverityBreakdown({ data }: SeverityBreakdownProps) {
  const chartColors = useChartColors();

  const renderTooltip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const entry = payload[0];

    return (
      <div
        style={{ background: chartColors.tooltipBg, border: `1px solid ${chartColors.tooltipBorder}` }}
        className="rounded-lg px-3 py-2 shadow-lg"
      >
        <p className="text-sm font-medium" style={{ color: entry.payload.fill }}>
          {entry.name}: {entry.value}
        </p>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="severity"
          cx="50%"
          cy="45%"
          innerRadius="55%"
          outerRadius="80%"
          paddingAngle={2}
          strokeWidth={0}
        >
          {data.map((entry) => (
            <Cell key={entry.severity} fill={getColor(entry.severity)} />
          ))}
        </Pie>
        <Tooltip content={renderTooltip} />
        <Legend content={<CustomLegend />} verticalAlign="bottom" />
      </PieChart>
    </ResponsiveContainer>
  );
}
