import { type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  ragStatus?: 'green' | 'amber' | 'red' | null;
  sparklineData?: number[];
  target?: string | number;
  icon?: ReactNode;
  className?: string;
}

const ragBorderColors = {
  green: 'border-l-rag-green',
  amber: 'border-l-rag-amber',
  red: 'border-l-rag-red',
} as const;

const trendConfig = {
  up: { icon: TrendingUp, color: 'text-rag-green' },
  down: { icon: TrendingDown, color: 'text-rag-red' },
  stable: { icon: Minus, color: 'text-muted' },
} as const;

function Sparkline({ data, className }: { data: number[]; className?: string }) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const width = 80;
  const height = 24;
  const padding = 1;

  const points = data
    .map((val, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2);
      const y = height - padding - ((val - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn('h-6 w-20', className)}
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-qod-accent"
      />
    </svg>
  );
}

export function StatCard({
  title,
  value,
  subtitle,
  trend,
  trendValue,
  ragStatus,
  sparklineData,
  target,
  icon,
  className,
}: StatCardProps) {
  const TrendIcon = trend ? trendConfig[trend].icon : null;
  const trendColor = trend ? trendConfig[trend].color : '';

  return (
    <div
      className={cn(
        'bg-qod-surface border border-qod-border rounded-lg p-4 border-l-[3px]',
        ragStatus ? ragBorderColors[ragStatus] : 'border-l-qod-border',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {icon && <span className="text-muted shrink-0">{icon}</span>}
            <p className="text-xs font-medium text-muted uppercase tracking-wider truncate">
              {title}
            </p>
          </div>

          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-primary">{value}</span>
            {target && (
              <span className="text-xs text-muted">/ {target}</span>
            )}
          </div>

          <div className="mt-1 flex items-center gap-2">
            {trend && TrendIcon && (
              <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', trendColor)}>
                <TrendIcon className="h-3 w-3" />
                {trendValue && <span>{trendValue}</span>}
              </span>
            )}
            {subtitle && (
              <span className="text-xs text-muted truncate">{subtitle}</span>
            )}
          </div>
        </div>

        {sparklineData && sparklineData.length >= 2 && (
          <div className="shrink-0 self-end">
            <Sparkline data={sparklineData} />
          </div>
        )}
      </div>
    </div>
  );
}
