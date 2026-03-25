'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from 'recharts';
import { useChartColors } from '@/lib/hooks/use-chart-colors';

interface ExecutionTimelineDataPoint {
  date: string;
  passed: number;
  failed: number;
  skipped: number;
}

interface ExecutionTimelineProps {
  data: ExecutionTimelineDataPoint[];
}

export function ExecutionTimeline({ data }: ExecutionTimelineProps) {
  const chartColors = useChartColors();

  const renderTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;

    const total = payload.reduce((sum, p) => sum + (p.value as number), 0);

    return (
      <div
        style={{ background: chartColors.tooltipBg, border: `1px solid ${chartColors.tooltipBorder}` }}
        className="rounded-lg px-3 py-2 shadow-lg"
      >
        <p style={{ color: chartColors.tooltipText }} className="mb-1 text-xs">{label}</p>
        {payload.map((entry) => {
          const labels: Record<string, string> = {
            passed: 'Passed',
            failed: 'Failed',
            skipped: 'Skipped',
          };
          return (
            <p
              key={entry.name}
              className="text-sm font-medium"
              style={{ color: entry.color }}
            >
              {labels[entry.name as string] ?? entry.name}: {entry.value}
            </p>
          );
        })}
        <p
          style={{ color: chartColors.tooltipText, borderColor: chartColors.tooltipBorder }}
          className="mt-1 border-t pt-1 text-xs"
        >
          Total: {total}
        </p>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="gradPassed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={chartColors.green} stopOpacity={0.4} />
            <stop offset="100%" stopColor={chartColors.green} stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="gradFailed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={chartColors.red} stopOpacity={0.4} />
            <stop offset="100%" stopColor={chartColors.red} stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="gradSkipped" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={chartColors.axis} stopOpacity={0.4} />
            <stop offset="100%" stopColor={chartColors.axis} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
        <XAxis
          dataKey="date"
          stroke={chartColors.axis}
          fontSize={12}
          tickLine={false}
          axisLine={{ stroke: chartColors.grid }}
        />
        <YAxis
          stroke={chartColors.axis}
          fontSize={12}
          tickLine={false}
          axisLine={{ stroke: chartColors.grid }}
          allowDecimals={false}
        />
        <Tooltip content={renderTooltip} />
        <Area
          type="monotone"
          dataKey="passed"
          stackId="1"
          stroke={chartColors.green}
          strokeWidth={1.5}
          fill="url(#gradPassed)"
        />
        <Area
          type="monotone"
          dataKey="failed"
          stackId="1"
          stroke={chartColors.red}
          strokeWidth={1.5}
          fill="url(#gradFailed)"
        />
        <Area
          type="monotone"
          dataKey="skipped"
          stackId="1"
          stroke={chartColors.axis}
          strokeWidth={1.5}
          fill="url(#gradSkipped)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
