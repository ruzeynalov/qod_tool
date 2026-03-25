'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from 'recharts';
import { useChartColors } from '@/lib/hooks/use-chart-colors';

interface PassRateDataPoint {
  date: string;
  passRate: number;
  target?: number;
}

interface PassRateTrendProps {
  data: PassRateDataPoint[];
}

export function PassRateTrend({ data }: PassRateTrendProps) {
  const chartColors = useChartColors();
  const hasTarget = data.some((d) => d.target != null);

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
            {entry.name === 'passRate' ? 'Pass Rate' : 'Target'}:{' '}
            {entry.value?.toFixed(1)}%
          </p>
        ))}
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
        <XAxis
          dataKey="date"
          stroke={chartColors.axis}
          fontSize={12}
          tickLine={false}
          axisLine={{ stroke: chartColors.grid }}
        />
        <YAxis
          domain={[0, 100]}
          stroke={chartColors.axis}
          fontSize={12}
          tickLine={false}
          axisLine={{ stroke: chartColors.grid }}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip content={renderTooltip} />
        <Line
          type="monotone"
          dataKey="passRate"
          stroke={chartColors.accent}
          strokeWidth={2}
          dot={{ r: 3, fill: chartColors.accent, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: chartColors.accent, strokeWidth: 0 }}
        />
        {hasTarget && (
          <Line
            type="monotone"
            dataKey="target"
            stroke={chartColors.axis}
            strokeWidth={1.5}
            strokeDasharray="6 4"
            dot={false}
            activeDot={false}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
