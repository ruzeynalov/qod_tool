'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  type TooltipProps,
} from 'recharts';
import { useChartColors } from '@/lib/hooks/use-chart-colors';

interface DefectTrendDataPoint {
  period: string;
  opened: number;
  closed: number;
}

interface DefectTrendProps {
  data: DefectTrendDataPoint[];
}

export function DefectTrend({ data }: DefectTrendProps) {
  const chartColors = useChartColors();

  const renderTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;

    return (
      <div
        style={{ background: chartColors.tooltipBg, border: `1px solid ${chartColors.tooltipBorder}` }}
        className="rounded-lg px-3 py-2 shadow-lg"
      >
        <p style={{ color: chartColors.tooltipText }} className="mb-1 text-xs">{label}</p>
        {payload.map((entry) => (
          <p key={entry.name} className="text-sm font-medium" style={{ color: entry.color }}>
            {entry.name === 'opened' ? 'Opened' : 'Closed'}: {entry.value}
          </p>
        ))}
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
        <XAxis
          dataKey="period"
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
        <Legend
          wrapperStyle={{ fontSize: 12, color: chartColors.axis }}
          formatter={(value: string) =>
            value === 'opened' ? 'Opened' : 'Closed'
          }
        />
        <Bar dataKey="opened" fill={chartColors.red} radius={[4, 4, 0, 0]} />
        <Bar dataKey="closed" fill={chartColors.green} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
