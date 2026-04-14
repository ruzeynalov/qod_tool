'use client';

import { useState, useMemo, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  type TooltipProps,
} from 'recharts';
import {
  ShieldCheck,
  CheckCircle2,
  CalendarCheck,
  Zap,
  Clock,
  Wrench,
  AlertTriangle,
  Gauge,
  Rocket,
  BookOpen,
  Bug,
  Loader2,
} from 'lucide-react';
import { useKPIDashboard, useDefectFilterOptions, useCoverageData } from '@/lib/api/hooks';
import { useChartColors } from '@/lib/hooks/use-chart-colors';
import { StatCard } from '@/components/ui/stat-card';
import { cn } from '@/lib/utils/cn';
import type { KPICard } from '@/lib/demo/demo-data-provider';

// ── Metric display configuration ────────────────────────────────────────

type MetricKey =
  | 'COVERAGE_PCT'
  | 'PASS_RATE_7D'
  | 'PASS_RATE_30D'
  | 'FLAKY_RATE'
  | 'MTTD_HOURS'
  | 'MTTR_HOURS'
  | 'ESCAPE_RATE'
  | 'EXEC_VELOCITY'
  | 'DEFECT_DENSITY'
  | 'REQ_COVERAGE'
  | 'READINESS_SCORE';

interface MetricMeta {
  label: string;
  icon: React.ReactNode;
  format: (v: number) => string;
  formatTarget: (v: number) => string;
  unit: string;
  lowerIsBetter: boolean;
  chartDomain?: [number, number];
}

const METRIC_ORDER: MetricKey[] = [
  'COVERAGE_PCT',
  'PASS_RATE_30D',
  'FLAKY_RATE',
  'MTTR_HOURS',
  'ESCAPE_RATE',
  'REQ_COVERAGE',
  'READINESS_SCORE',
  'DEFECT_DENSITY',
  'PASS_RATE_7D',
];

const METRIC_META: Record<MetricKey, MetricMeta> = {
  COVERAGE_PCT: {
    label: 'Automation Coverage',
    icon: <ShieldCheck className="h-3.5 w-3.5" />,
    format: (v) => `${v.toFixed(1)}%`,
    formatTarget: (v) => `${v.toFixed(0)}%`,
    unit: '%',
    lowerIsBetter: false,
    chartDomain: [0, 100],
  },
  PASS_RATE_7D: {
    label: 'Pass Rate (7d)',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    format: (v) => `${v.toFixed(1)}%`,
    formatTarget: (v) => `${v.toFixed(0)}%`,
    unit: '%',
    lowerIsBetter: false,
    chartDomain: [0, 100],
  },
  PASS_RATE_30D: {
    label: 'Pass Rate (30d)',
    icon: <CalendarCheck className="h-3.5 w-3.5" />,
    format: (v) => `${v.toFixed(1)}%`,
    formatTarget: (v) => `${v.toFixed(0)}%`,
    unit: '%',
    lowerIsBetter: false,
    chartDomain: [0, 100],
  },
  FLAKY_RATE: {
    label: 'Flaky Test Rate',
    icon: <Zap className="h-3.5 w-3.5" />,
    format: (v) => `${v.toFixed(1)}%`,
    formatTarget: (v) => `${v.toFixed(0)}%`,
    unit: '%',
    lowerIsBetter: true,
  },
  MTTD_HOURS: {
    label: 'Mean Time to Detect',
    icon: <Clock className="h-3.5 w-3.5" />,
    format: (v) => `${v.toFixed(1)}h`,
    formatTarget: (v) => `${v.toFixed(0)}h`,
    unit: 'h',
    lowerIsBetter: true,
  },
  MTTR_HOURS: {
    label: 'Median Time to Resolve',
    icon: <Wrench className="h-3.5 w-3.5" />,
    format: (v) => v >= 48 ? `${(v / 24).toFixed(1)}d` : `${v.toFixed(1)}h`,
    formatTarget: (v) => v >= 48 ? `${(v / 24).toFixed(0)}d` : `${v.toFixed(0)}h`,
    unit: 'h',
    lowerIsBetter: true,
  },
  ESCAPE_RATE: {
    label: 'Defect Escape Rate',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    format: (v) => `${v.toFixed(1)}%`,
    formatTarget: (v) => `${v.toFixed(0)}%`,
    unit: '%',
    lowerIsBetter: true,
  },
  EXEC_VELOCITY: {
    label: 'Runs per Day',
    icon: <Gauge className="h-3.5 w-3.5" />,
    format: (v) => v < 1 ? v.toFixed(2) : v.toFixed(1),
    formatTarget: (v) => `${Math.round(v)}`,
    unit: 'runs/day',
    lowerIsBetter: false,
  },
  DEFECT_DENSITY: {
    label: 'Defect Density',
    icon: <Bug className="h-3.5 w-3.5" />,
    format: (v) => `${v.toFixed(1)}%`,
    formatTarget: (v) => `${v.toFixed(0)}%`,
    unit: '%',
    lowerIsBetter: true,
  },
  REQ_COVERAGE: {
    label: 'Requirement Coverage',
    icon: <BookOpen className="h-3.5 w-3.5" />,
    format: (v) => `${v.toFixed(1)}%`,
    formatTarget: (v) => `${v.toFixed(0)}%`,
    unit: '%',
    lowerIsBetter: false,
    chartDomain: [0, 100],
  },
  READINESS_SCORE: {
    label: 'Release Readiness',
    icon: <Rocket className="h-3.5 w-3.5" />,
    format: (v) => `${v.toFixed(1)}%`,
    formatTarget: (v) => `${v.toFixed(0)}%`,
    unit: '%',
    lowerIsBetter: false,
    chartDomain: [0, 100],
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────

function mapRag(rag: KPICard['ragStatus']): 'green' | 'amber' | 'red' | undefined {
  if (rag === 'NONE') return undefined;
  return rag.toLowerCase() as 'green' | 'amber' | 'red';
}

function mapTrend(trend: KPICard['trend']): 'up' | 'down' | 'stable' {
  if (trend === 'UP') return 'up';
  if (trend === 'DOWN') return 'down';
  return 'stable';
}

function trendLabel(
  trend: KPICard['trend'],
  lowerIsBetter: boolean,
): string {
  if (trend === 'FLAT') return '';
  const improving =
    (trend === 'UP' && !lowerIsBetter) || (trend === 'DOWN' && lowerIsBetter);
  return improving ? 'improving' : 'worsening';
}

// ── Detail chart tooltip ────────────────────────────────────────────────

function DetailTooltip({
  active,
  payload,
  label,
  unit,
}: TooltipProps<number, string> & { unit: string }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-qod-border bg-qod-surface px-3 py-2 shadow-xl">
      <p className="mb-1 text-[11px] text-muted">{label}</p>
      {payload.map((entry) => (
        <p
          key={entry.name}
          className="text-sm font-medium"
          style={{ color: entry.color }}
        >
          {entry.name === 'target' ? 'Target' : 'Value'}:{' '}
          {typeof entry.value === 'number' ? entry.value.toFixed(1) : entry.value}
          {unit}
        </p>
      ))}
    </div>
  );
}

// ── Date range options ──────────────────────────────────────────────────

const RANGE_OPTIONS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const;

// ── Main page component ─────────────────────────────────────────────────

export default function KPIDashboardPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? '';

  const { data: kpis, isLoading, isFetching, error } = useKPIDashboard(projectId);
  const { data: defectFilterOpts } = useDefectFilterOptions(projectId);
  const { data: coverageData } = useCoverageData(projectId);
  const chartColors = useChartColors();

  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('PASS_RATE_7D');
  const [rangeDays, setRangeDays] = useState<number>(30);

  // Compute Defect Density client-side and inject into KPI list
  const enrichedKpis = useMemo(() => {
    if (!kpis) return undefined;
    const totalTC = (coverageData ?? []).reduce((s, c) => s + c.totalTestCases, 0);
    const openCount = defectFilterOpts?.openCount ?? 0;
    const result = kpis.filter((k) => k.metric !== 'EXEC_VELOCITY' && k.metric !== 'MTTD_HOURS');
    if (totalTC > 0) {
      const density = (openCount / totalTC) * 100;
      const ragStatus = density <= 2 ? 'GREEN' : density <= 5 ? 'AMBER' : 'RED';
      result.push({
        metric: 'DEFECT_DENSITY',
        latestValue: density,
        hasData: true,
        target: null as any,
        ragStatus,
        sparkline: [],
        trend: 'FLAT',
      });
    }
    return result;
  }, [kpis, coverageData, defectFilterOpts]);

  // Build an ordered list of cards from the data
  const orderedCards = useMemo(() => {
    if (!enrichedKpis) return [];
    const map = new Map(enrichedKpis.map((k) => [k.metric, k]));
    return METRIC_ORDER.map((key) => ({
      key,
      card: map.get(key),
      meta: METRIC_META[key],
    })).filter((entry) => entry.card != null) as {
      key: MetricKey;
      card: KPICard;
      meta: MetricMeta;
    }[];
  }, [enrichedKpis]);

  // Available metrics for the dropdown (only those with data)
  const availableMetrics = useMemo(() => {
    if (!enrichedKpis) return METRIC_ORDER;
    const available = new Set(enrichedKpis.map((k) => k.metric));
    const filtered = METRIC_ORDER.filter((key) => available.has(key));
    return filtered.length > 0 ? filtered : METRIC_ORDER;
  }, [enrichedKpis]);

  // Auto-select first available metric if current selection has no data
  useEffect(() => {
    if (availableMetrics.length > 0 && !availableMetrics.includes(selectedMetric)) {
      setSelectedMetric(availableMetrics[0]);
    }
  }, [availableMetrics, selectedMetric]);

  // Build sparkline chart data for the selected KPI
  const detailChartData = useMemo(() => {
    if (!enrichedKpis) return [];
    const card = enrichedKpis.find((k) => k.metric === selectedMetric);
    if (!card) return [];

    const meta = METRIC_META[selectedMetric];
    const sparkline = card.sparkline;

    // Generate synthetic date labels going backwards from today
    const today = new Date();
    const totalPoints = sparkline.length;
    const sliceCount = Math.min(rangeDays, totalPoints);
    const slicedData = sparkline.slice(-sliceCount);

    return slicedData.map((point, i) => {
      const val = typeof point === 'number' ? point : (point as any).value ?? 0;
      const date = new Date(today);
      date.setDate(date.getDate() - (sliceCount - 1 - i));
      return {
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: parseFloat(val.toFixed(2)),
        target: card.target,
      };
    });
  }, [enrichedKpis, selectedMetric, rangeDays]);

  const selectedMeta = METRIC_META[selectedMetric];
  const selectedCard = enrichedKpis?.find((k) => k.metric === selectedMetric);

  // ── Loading state ───────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-qod-accent" />
        <span className="ml-3 text-sm text-secondary">Loading KPI data...</span>
      </div>
    );
  }

  if (error) {
    const isAccessDenied = (error as Error)?.message?.toLowerCase().includes('access');
    return (
      <div className="flex h-80 items-center justify-center">
        <AlertTriangle className="h-5 w-5 text-rag-red" />
        <span className="ml-2 text-sm text-secondary">
          {isAccessDenied
            ? 'You do not have access to this project. Contact an administrator to request access.'
            : 'Failed to load KPI data. Please try again.'}
        </span>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-lg font-semibold text-primary">
          Quality KPI Dashboard
        </h1>
        <p className="mt-0.5 text-xs text-muted">
          Executive-level quality metrics overview. Cards are color-coded by RAG status against targets.
        </p>
      </div>

      {/* ── KPI Grid ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {orderedCards.map(({ key, card, meta }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSelectedMetric(key)}
            className={cn(
              'text-left transition-all rounded-lg',
              isFetching && !isLoading && 'animate-pulse',
              selectedMetric === key
                ? 'ring-2 ring-qod-accent ring-offset-1 ring-offset-qod-bg'
                : 'hover:ring-1 hover:ring-qod-border',
            )}
          >
            <StatCard
              title={meta.label}
              value={card.hasData === false ? 'N/A' : meta.format(card.latestValue)}
              target={card.target != null ? meta.formatTarget(card.target) : '—'}
              ragStatus={card.hasData === false ? undefined : mapRag(card.ragStatus)}
              trend={card.hasData === false ? undefined : mapTrend(card.trend)}
              trendValue={card.hasData === false ? 'no data' : trendLabel(card.trend, meta.lowerIsBetter)}
              sparklineData={card.hasData === false ? [] : card.sparkline.slice(-14)}
              icon={meta.icon}
            />
          </button>
        ))}
      </div>

      {/* ── KPI Trend Detail ───────────────────────────────────────────── */}
      <div className="rounded-lg border border-qod-border bg-qod-surface">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-qod-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <label
              htmlFor="kpi-select"
              className="text-xs font-medium text-secondary"
            >
              KPI
            </label>
            <select
              id="kpi-select"
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value as MetricKey)}
              className="rounded-md border border-qod-border bg-qod-bg px-3 py-1.5 text-sm text-primary outline-none focus:ring-1 focus:ring-qod-accent"
            >
              {availableMetrics.map((key) => (
                <option key={key} value={key}>
                  {METRIC_META[key].label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.days}
                type="button"
                onClick={() => setRangeDays(opt.days)}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  rangeDays === opt.days
                    ? 'bg-qod-accent text-white'
                    : 'bg-qod-bg text-secondary hover:text-primary',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Chart header */}
        <div className="px-5 pt-4 pb-1">
          <div className="flex items-baseline gap-3">
            <span className="text-sm font-semibold text-primary">
              {selectedMeta.label}
            </span>
            {selectedCard && (
              <>
                <span className="text-xl font-bold text-primary">
                  {selectedCard.hasData === false ? 'N/A' : selectedMeta.format(selectedCard.latestValue)}
                </span>
                <span className="text-xs text-muted">
                  target {selectedCard.target != null ? selectedMeta.formatTarget(selectedCard.target) : '—'}
                </span>
                {selectedCard.hasData !== false && (
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                      selectedCard.ragStatus === 'GREEN' && 'bg-rag-green/15 text-rag-green',
                      selectedCard.ragStatus === 'AMBER' && 'bg-rag-amber/15 text-rag-amber',
                      selectedCard.ragStatus === 'RED' && 'bg-rag-red/15 text-rag-red',
                    )}
                  >
                    {selectedCard.ragStatus}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Line chart */}
        <div className="h-72 px-3 pb-4">
          {detailChartData.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted">No historical data available for this metric yet.</p>
            </div>
          ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={detailChartData}
              margin={{ top: 12, right: 12, left: -4, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis
                dataKey="date"
                stroke={chartColors.axis}
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: chartColors.grid }}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke={chartColors.axis}
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: chartColors.grid }}
                domain={selectedMeta.chartDomain ?? ['auto', 'auto']}
                tickFormatter={(v: number) =>
                  selectedMeta.unit === '%'
                    ? `${v}%`
                    : selectedMeta.unit === 'h'
                      ? `${v}h`
                      : String(v)
                }
              />
              <Tooltip
                content={(props: any) => (
                  <DetailTooltip {...props} unit={selectedMeta.unit} />
                )}
              />
              {selectedCard && selectedCard.target != null && (
                <ReferenceLine
                  y={selectedCard.target}
                  stroke={chartColors.axis}
                  strokeDasharray="6 4"
                  strokeWidth={1.5}
                  label={{
                    value: `Target ${selectedMeta.formatTarget(selectedCard.target)}`,
                    position: 'right',
                    fill: chartColors.axis,
                    fontSize: 10,
                  }}
                />
              )}
              <Line
                type="monotone"
                dataKey="value"
                stroke={chartColors.accent}
                strokeWidth={2}
                dot={{ r: 2.5, fill: chartColors.accent, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: chartColors.accent, stroke: chartColors.tooltipBg, strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
