'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  type TooltipProps,
} from 'recharts';
import { useChartColors } from '@/lib/hooks/use-chart-colors';

interface FlakyTestData {
  name: string;
  flakinessScore: number;
  totalRuns: number;
}

interface FlakyTestsChartProps {
  data: FlakyTestData[];
}

function getBarColor(score: number): string {
  // Gradient from amber (low flaky) to red (high flaky)
  if (score >= 75) return '#ef4444';
  if (score >= 50) return '#f97316';
  if (score >= 25) return '#f59e0b';
  return '#fbbf24';
}

export function FlakyTestsChart({ data }: FlakyTestsChartProps) {
  const chartColors = useChartColors();
  const sorted = [...data].sort((a, b) => b.flakinessScore - a.flakinessScore);

  const renderTooltip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const item = payload[0].payload as FlakyTestData;

    return (
      <div
        style={{ background: chartColors.tooltipBg, border: `1px solid ${chartColors.tooltipBorder}` }}
        className="rounded-lg px-3 py-2 shadow-lg"
      >
        <p style={{ color: chartColors.tooltipText }} className="mb-1 max-w-[240px] truncate text-xs">
          {item.name}
        </p>
        <p className="text-sm font-medium text-amber-400">
          Flakiness: {item.flakinessScore}%
        </p>
        <p style={{ color: chartColors.tooltipText }} className="text-xs">
          Total runs: {item.totalRuns}
        </p>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={sorted}
        layout="vertical"
        margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} horizontal={false} />
        <XAxis
          type="number"
          domain={[0, 100]}
          stroke={chartColors.axis}
          fontSize={12}
          tickLine={false}
          axisLine={{ stroke: chartColors.grid }}
          tickFormatter={(v: number) => `${v}%`}
        />
        <YAxis
          type="category"
          dataKey="name"
          stroke={chartColors.axis}
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: chartColors.grid }}
          width={140}
          tick={{ fill: chartColors.axis }}
          tickFormatter={(v: string) =>
            v.length > 22 ? `${v.slice(0, 20)}...` : v
          }
        />
        <Tooltip content={renderTooltip} cursor={{ fill: chartColors.cursorFill }} />
        <Bar dataKey="flakinessScore" radius={[0, 4, 4, 0]} barSize={18}>
          {sorted.map((entry) => (
            <Cell key={entry.name} fill={getBarColor(entry.flakinessScore)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
