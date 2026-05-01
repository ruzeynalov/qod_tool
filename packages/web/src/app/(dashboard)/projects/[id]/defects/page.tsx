'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  AreaChart,
  Area,
  type TooltipProps,
} from 'recharts';
import {
  Bug,
  AlertTriangle,
  ShieldAlert,
  Clock,
  Timer,
} from 'lucide-react';

import { useDefects, useDefectTrend, useSeverityBreakdown, useDefectTimingStats, useDefectFilterOptions, useKPIDashboard, useCoverageData } from '@/lib/api/hooks';
import dynamic from 'next/dynamic';

const DefectTrend = dynamic(
  () => import('@/components/charts/defect-trend').then((m) => m.DefectTrend),
  { ssr: false },
);
const SeverityBreakdown = dynamic(
  () => import('@/components/charts/severity-breakdown').then((m) => m.SeverityBreakdown),
  { ssr: false },
);
import {
  Card,
  Badge,
  StatCard,
  Spinner,
  SearchInput,
  Select,
  type DataTableColumn,
} from '@/components/ui';
import { useChartColors } from '@/lib/hooks/use-chart-colors';
import { cn } from '@/lib/utils/cn';
import type { DemoDefect } from '@qod/shared';
import type { DailyDefectTrend } from '@/lib/demo/demo-data-provider';

// ── Helpers ──────────────────────────────────────────────────────────


function severityBadgeVariant(s: string) {
  switch (s) {
    case 'CRITICAL':
      return 'error' as const;
    case 'HIGH':
      return 'warning' as const;
    case 'MEDIUM':
      return 'info' as const;
    default:
      return 'neutral' as const;
  }
}

function priorityBadgeVariant(p: string) {
  switch (p) {
    case 'P0':
      return 'error' as const;
    case 'P1':
      return 'warning' as const;
    case 'P2':
      return 'info' as const;
    default:
      return 'neutral' as const;
  }
}

function statusBadgeVariant(s: string) {
  switch (s) {
    case 'OPEN':
    case 'REOPENED':
      return 'error' as const;
    case 'IN_PROGRESS':
      return 'warning' as const;
    case 'RESOLVED':
      return 'success' as const;
    case 'CLOSED':
      return 'neutral' as const;
    default:
      return 'neutral' as const;
  }
}

function formatAge(createdAt: Date | string): string {
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  if (diffWeeks < 4) return `${diffWeeks}w`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo`;
}

function ageDays(createdAt: Date | string): number {
  return (new Date().getTime() - new Date(createdAt).getTime()) / 86_400_000;
}

function formatMTTR(hours: number): string {
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 1) return `${Math.round(hours)}h`;
  return `${days.toFixed(1)}d`;
}

function severityBorderClass(severity: string): string {
  switch (severity) {
    case 'CRITICAL':
      return 'border-l-2 border-l-red-500/60';
    case 'HIGH':
      return 'border-l-2 border-l-orange-500/40';
    case 'MEDIUM':
      return 'border-l-2 border-l-blue-500/30';
    default:
      return 'border-l-2 border-l-transparent';
  }
}

// ── Age Distribution bucket computation ──────────────────────────────

interface AgeBucket {
  label: string;
  count: number;
  color: string;
}


// ── Custom tooltip for age chart ─────────────────────────────────────

function AgeTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-qod-border bg-qod-surface px-3 py-2 shadow-lg">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-sm font-medium text-primary">
        {payload[0].value} defect{payload[0].value !== 1 ? 's' : ''}
      </p>
    </div>
  );
}

// ── Period selector options ──────────────────────────────────────────

const PERIOD_OPTIONS = [
  { value: '7', label: 'Last week' },
  { value: '14', label: 'Last 2 weeks' },
  { value: '30', label: 'Last month' },
];

const SEVERITY_OPTIONS = [
  { value: '', label: 'All Severities' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'REOPENED', label: 'Reopened' },
];

// ── Page Component ───────────────────────────────────────────────────

export default function DefectsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? '';

  // ── Filter state ─────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [componentFilter, setComponentFilter] = useState('');
  const [labelFilter, setLabelFilter] = useState('');
  const [trendPeriod, setTrendPeriod] = useState('14');

  // ── Data hooks ───────────────────────────────────────────────────
  const {
    data: defectsData,
    isLoading: defectsLoading,
  } = useDefects(projectId, {
    severity: (severityFilter || undefined) as DemoDefect['severity'] | undefined,
    status: (statusFilter || undefined) as DemoDefect['status'] | undefined,
    label: labelFilter || undefined,
    search: search || undefined,
    page,
    pageSize: 20,
  });

  const { data: defectFilterOptions, isFetching: statsFetching } = useDefectFilterOptions(projectId);

  const { data: trendData, isLoading: trendLoading } = useDefectTrend(projectId);
  const { data: severityData, isLoading: severityLoading } = useSeverityBreakdown(projectId);
  const { data: timingStats, isLoading: timingLoading } = useDefectTimingStats(projectId);
  const { data: kpis = [] } = useKPIDashboard(projectId);
  const mttdHours = kpis.find((k) => k.metric === 'MTTD_HOURS')?.latestValue ?? 0;
  const { data: coverageData } = useCoverageData(projectId);

  const chartColors = useChartColors();

  // ── Derived data ─────────────────────────────────────────────────

  // Summary counts come from the server (accurate across all defects)
  const totalCount = defectFilterOptions?.totalCount ?? 0;
  const openCount = defectFilterOptions?.openCount ?? 0;
  const escapedCount = defectFilterOptions?.escapedCount ?? 0;
  const critHighCount = defectFilterOptions?.critHighCount ?? 0;

  const tableDefectsRaw = defectsData?.items ?? [];

  const avgMTTR = useMemo(() => {
    const resolved = tableDefectsRaw.filter((d) => d.resolvedAt);
    if (resolved.length === 0) return 0;
    const totalHours = resolved.reduce((sum, d) => {
      const created = new Date(d.createdAt).getTime();
      const res = new Date(d.resolvedAt!).getTime();
      return sum + (res - created) / 3_600_000;
    }, 0);
    return totalHours / resolved.length;
  }, [tableDefectsRaw]);

  // Trend data filtered by period (daily)
  const trendChartData = useMemo(() => {
    if (!trendData) return [];
    const days = parseInt(trendPeriod, 10);
    return trendData.slice(-days).map((d) => ({
      period: d.date.slice(5), // MM-DD
      opened: d.opened,
      closed: d.closed,
    }));
  }, [trendData, trendPeriod]);

  // Age distribution from server-side computation
  const AGE_LABELS: AgeBucket[] = [
    { label: '<1d', count: 0, color: '#10b981' },
    { label: '1-3d', count: 0, color: '#22d3ee' },
    { label: '3-7d', count: 0, color: '#3b82f6' },
    { label: '1-2w', count: 0, color: '#a78bfa' },
    { label: '2-4w', count: 0, color: '#f59e0b' },
    { label: '1-3m', count: 0, color: '#f97316' },
    { label: '3-6m', count: 0, color: '#e11d48' },
    { label: '6m-1y', count: 0, color: '#dc2626' },
    { label: '>1y', count: 0, color: '#991b1b' },
  ];
  const ageBuckets = useMemo(() => {
    const serverBuckets = defectFilterOptions?.ageBuckets;
    if (!serverBuckets) return AGE_LABELS;
    return AGE_LABELS.map((b, i) => ({ ...b, count: serverBuckets[i] ?? 0 }));
  }, [defectFilterOptions]);

  // Component options from server
  const componentOptions = useMemo(() => [
    { value: '', label: 'All Components' },
    ...(defectFilterOptions?.components ?? []).map((c) => ({ value: c, label: c })),
  ], [defectFilterOptions]);

  // Label options from dedicated filter-options endpoint
  const labelOptions = useMemo(() => [
    { value: '', label: 'All Labels' },
    ...(defectFilterOptions?.labels ?? []).map((l) => ({ value: l, label: l })),
  ], [defectFilterOptions]);

  // Open defect burndown (last 12 weeks)
  const burndownData = useMemo(() => {
    if (!timingStats?.openBurndown) return [];
    return timingStats.openBurndown.map((d) => ({
      week: d.week.slice(5), // MM-DD
      open: d.open,
    }));
  }, [timingStats]);

  // Filter defects by component locally (the API hook doesn't support component filter directly)
  const tableDefects = useMemo(() => {
    if (!defectsData) return [];
    if (!componentFilter) return defectsData.items;
    return defectsData.items.filter((d) => d.component === componentFilter);
  }, [defectsData, componentFilter]);

  // ── Table columns ────────────────────────────────────────────────

  const columns: DataTableColumn<DemoDefect>[] = useMemo(
    () => [
      {
        key: 'externalId',
        header: 'ID',
        className: 'w-28',
        render: (row) => (
          row.url ? (
            <a href={row.url} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-qod-accent hover:underline">
              {row.externalId}
            </a>
          ) : (
            <span className="font-mono text-xs text-secondary">{row.externalId}</span>
          )
        ),
      },
      {
        key: 'title',
        header: 'Title',
        className: 'min-w-[200px]',
        render: (row) => (
          <span className="font-medium text-primary line-clamp-1">{row.title}</span>
        ),
      },
      {
        key: 'severity',
        header: 'Severity',
        sortable: true,
        className: 'w-24',
        render: (row) => (
          <Badge variant={severityBadgeVariant(row.severity)}>
            {row.severity.toLowerCase()}
          </Badge>
        ),
      },
      {
        key: 'priority',
        header: 'Priority',
        sortable: true,
        className: 'w-20',
        render: (row) => (
          <Badge variant={priorityBadgeVariant(row.priority)}>
            {row.priority}
          </Badge>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        className: 'w-28',
        render: (row) => (
          <Badge variant={statusBadgeVariant(row.status)}>
            {row.status.toLowerCase().replace('_', ' ')}
          </Badge>
        ),
      },
      {
        key: 'component',
        header: 'Component',
        className: 'w-32',
        render: (row) => (
          <span className="text-xs text-secondary">{row.component}</span>
        ),
      },
      {
        key: 'createdAt',
        header: 'Age',
        sortable: true,
        className: 'w-16',
        render: (row) => (
          <span
            className={cn(
              'text-xs font-medium',
              ageDays(row.createdAt) > 14
                ? 'text-rag-red'
                : ageDays(row.createdAt) > 7
                  ? 'text-rag-amber'
                  : 'text-secondary',
            )}
          >
            {formatAge(row.createdAt)}
          </span>
        ),
      },
      {
        key: 'labels',
        header: 'Labels',
        className: 'w-36',
        render: (row) => (
          <div className="flex flex-wrap gap-1">
            {(row as any).labels?.length > 0
              ? (row as any).labels.map((l: string) => (
                  <span key={l} className="inline-block rounded bg-qod-surface px-1.5 py-0.5 text-[10px] text-muted">
                    {l}
                  </span>
                ))
              : <span className="text-xs text-muted">—</span>}
          </div>
        ),
      },
    ],
    [],
  );

  // ── Loading state ────────────────────────────────────────────────

  const isLoading = defectsLoading;

  if (isLoading && !defectsData) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* ── Defect Resolution Timing ──────────────────────────────── */}
      {!timingLoading && timingStats && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
            <Timer className="h-4 w-4 text-muted" />
            Defect Resolution Timing
          </h3>

          {/* Timing stat cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              title="Avg MTTD"
              value={formatMTTR(mttdHours)}
              icon={<Clock className="h-4 w-4" />}
              ragStatus={
                mttdHours > 12
                  ? 'red'
                  : mttdHours > 4
                    ? 'amber'
                    : 'green'
              }
              subtitle="mean time to detect"
            />
            {(() => {
              const totalTC = (coverageData ?? []).reduce((s, c) => s + c.totalTestCases, 0);
              const density = totalTC > 0 ? (openCount / totalTC) * 100 : 0;
              return (
                <StatCard
                  title="Defect Density"
                  value={`${density.toFixed(1)}%`}
                  icon={<Bug className="h-4 w-4" />}
                  ragStatus={density <= 2 ? 'green' : density <= 5 ? 'amber' : 'red'}
                  subtitle="open defects per 100 tests"
                />
              );
            })()}
            <StatCard
              title="Median MTTR"
              value={formatMTTR(timingStats.medianMTTRHours)}
              icon={<Clock className="h-4 w-4" />}
              ragStatus={
                timingStats.medianMTTRHours > 120
                  ? 'red'
                  : timingStats.medianMTTRHours > 48
                    ? 'amber'
                    : 'green'
              }
              subtitle="50th percentile"
            />
          </div>

          {/* MTTR by severity + MTTR trend chart side-by-side */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {/* MTTR by severity table */}
            <Card padding="sm">
              <div className="px-3 pt-2 pb-1">
                <h4 className="text-sm font-semibold text-primary">
                  MTTR by Severity
                </h4>
              </div>
              <table className="w-full text-sm text-left mt-2">
                <thead>
                  <tr className="border-b border-qod-border">
                    <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-secondary">
                      Severity
                    </th>
                    <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-secondary text-right">
                      Avg MTTR
                    </th>
                    <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-secondary text-right">
                      Count
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {timingStats.mttrBySeverity.map((row) => (
                    <tr
                      key={row.severity}
                      className="border-b border-qod-border/50"
                    >
                      <td className="px-4 py-2">
                        <Badge variant={severityBadgeVariant(row.severity)}>
                          {row.severity.toLowerCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-right text-sm text-primary font-medium">
                        {formatMTTR(row.avgHours)}
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-muted">
                        {row.count} resolved
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            {/* Open defect burndown */}
            <Card padding="sm">
              <div className="px-3 pt-2 pb-1">
                <h4 className="text-sm font-semibold text-primary">
                  Open Defect Burndown
                </h4>
              </div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={burndownData}
                    margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={chartColors.grid}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="week"
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
                    <RechartsTooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="rounded-lg border border-qod-border bg-qod-surface px-3 py-2 shadow-lg">
                            <p className="text-xs text-muted">Week of {label}</p>
                            <p className="text-sm font-medium text-primary">
                              {payload[0].value} open defects
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="open"
                      stroke={chartColors.accent}
                      fill={chartColors.accent}
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ── Summary Cards ─────────────────────────────────────────── */}
      <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4', statsFetching && 'animate-pulse')}>
        <StatCard
          title="Total Open Defects"
          value={openCount}
          icon={<Bug className="h-4 w-4" />}
          ragStatus={
            openCount > 20
              ? 'red'
              : openCount > 10
                ? 'amber'
                : 'green'
          }
          subtitle={`of ${totalCount} total`}
        />
        <StatCard
          title="Critical / High"
          value={critHighCount}
          icon={<ShieldAlert className="h-4 w-4" />}
          ragStatus={critHighCount > 5 ? 'red' : critHighCount > 2 ? 'amber' : 'green'}
          subtitle="open critical + high"
        />
        <StatCard
          title="Escaped Defects"
          value={escapedCount}
          icon={<AlertTriangle className="h-4 w-4" />}
          ragStatus={escapedCount > 8 ? 'red' : escapedCount > 3 ? 'amber' : 'green'}
          subtitle="found in production"
        />
        <StatCard
          title="Avg MTTR"
          value={formatMTTR(avgMTTR)}
          icon={<Clock className="h-4 w-4" />}
          ragStatus={
            avgMTTR > 168
              ? 'red'
              : avgMTTR > 72
                ? 'amber'
                : 'green'
          }
          subtitle="mean time to resolve"
        />
      </div>

      {/* ── Charts Row ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Defect Inflow vs Resolution Trend */}
        <Card className="lg:col-span-2" padding="sm">
          <div className="flex items-center justify-between px-3 pt-2 pb-1">
            <h3 className="text-sm font-semibold text-primary">
              Defect Inflow vs Resolution
            </h3>
            <Select
              options={PERIOD_OPTIONS}
              value={trendPeriod}
              onChange={setTrendPeriod}
              className="w-36"
            />
          </div>
          <div className="h-64">
            {trendLoading ? (
              <div className="flex h-full items-center justify-center">
                <Spinner />
              </div>
            ) : (
              <DefectTrend data={trendChartData} />
            )}
          </div>
        </Card>

        {/* Severity Breakdown */}
        <Card padding="sm">
          <div className="px-3 pt-2 pb-1">
            <h3 className="text-sm font-semibold text-primary">
              Severity Breakdown
            </h3>
          </div>
          <div className="h-64">
            {severityLoading ? (
              <div className="flex h-full items-center justify-center">
                <Spinner />
              </div>
            ) : severityData ? (
              <SeverityBreakdown
                data={severityData.map((s) => ({
                  severity: s.severity.toLowerCase(),
                  count: s.count,
                }))}
              />
            ) : null}
          </div>
        </Card>
      </div>

      {/* ── Defect Age Distribution ───────────────────────────────── */}
      <Card padding="sm">
        <div className="px-3 pt-2 pb-1">
          <h3 className="text-sm font-semibold text-primary">
            Open Defect Age Distribution
          </h3>
          <p className="text-xs text-muted">
            How long open defects have been unresolved
          </p>
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={ageBuckets}
              layout="vertical"
              margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={chartColors.grid}
                horizontal={false}
              />
              <XAxis
                type="number"
                stroke={chartColors.axis}
                fontSize={12}
                tickLine={false}
                axisLine={{ stroke: chartColors.grid }}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                stroke={chartColors.axis}
                fontSize={12}
                tickLine={false}
                axisLine={{ stroke: chartColors.grid }}
                width={40}
              />
              <RechartsTooltip content={<AgeTooltip />} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={24}>
                {ageBuckets.map((bucket) => (
                  <Cell key={bucket.label} fill={bucket.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* ── Defect Table ──────────────────────────────────────────── */}
      <Card padding="sm">
        <div className="px-3 pt-2 pb-3">
          <h3 className="text-sm font-semibold text-primary mb-3">
            All Defects
          </h3>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(val) => {
                setSearch(val);
                setPage(1);
              }}
              placeholder="Search by ID, title, component..."
              className="w-64"
            />
            <Select
              options={SEVERITY_OPTIONS}
              value={severityFilter}
              onChange={(val) => {
                setSeverityFilter(val);
                setPage(1);
              }}
              className="w-36"
            />
            <Select
              options={STATUS_OPTIONS}
              value={statusFilter}
              onChange={(val) => {
                setStatusFilter(val);
                setPage(1);
              }}
              className="w-36"
            />
            <Select
              options={componentOptions}
              value={componentFilter}
              onChange={(val) => {
                setComponentFilter(val);
                setPage(1);
              }}
              className="w-40"
            />
            <Select
              options={labelOptions}
              value={labelFilter}
              onChange={(val) => {
                setLabelFilter(val);
                setPage(1);
              }}
              className="w-36"
            />
          </div>
        </div>

        {defectsLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <div className="overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-qod-border">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={cn(
                        'px-4 py-3 text-xs font-medium uppercase tracking-wider text-secondary',
                        col.sortable && 'cursor-pointer select-none hover:text-primary',
                        col.className,
                      )}
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableDefects.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="px-4 py-12 text-center text-muted"
                    >
                      No defects match the current filters
                    </td>
                  </tr>
                ) : (
                  tableDefects.map((defect, idx) => (
                    <tr
                      key={defect.id}
                      className={cn(
                        'border-b border-qod-border/50 transition-colors hover:bg-qod-bg',
                        idx % 2 === 1 && 'bg-qod-bg/30',
                        severityBorderClass(defect.severity),
                      )}
                    >
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className={cn('px-4 py-2.5 text-secondary', col.className)}
                        >
                          {col.render
                            ? col.render(defect)
                            : (defect as any)[col.key] as React.ReactNode ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Pagination */}
            {defectsData && defectsData.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-qod-border px-4 py-3">
                <span className="text-xs text-muted">
                  Showing{' '}
                  {(defectsData.page - 1) * defectsData.pageSize + 1}
                  &ndash;
                  {Math.min(
                    defectsData.page * defectsData.pageSize,
                    defectsData.total,
                  )}{' '}
                  of {defectsData.total}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    className="rounded px-2 py-1 text-xs text-secondary hover:bg-qod-bg hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </button>
                  {Array.from(
                    { length: defectsData.totalPages },
                    (_, i) => i + 1,
                  )
                    .filter((p) => {
                      return (
                        p === 1 ||
                        p === defectsData.totalPages ||
                        Math.abs(p - page) <= 1
                      );
                    })
                    .reduce<(number | 'ellipsis')[]>((acc, p, i, arr) => {
                      if (i > 0 && p - (arr[i - 1] as number) > 1) {
                        acc.push('ellipsis');
                      }
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((item, idx) =>
                      item === 'ellipsis' ? (
                        <span
                          key={`ellipsis-${idx}`}
                          className="px-1 text-xs text-muted"
                        >
                          ...
                        </span>
                      ) : (
                        <button
                          key={item}
                          className={cn(
                            'rounded px-2 py-1 text-xs',
                            item === page
                              ? 'bg-qod-accent text-white'
                              : 'text-secondary hover:bg-qod-bg hover:text-primary',
                          )}
                          onClick={() => setPage(item)}
                        >
                          {item}
                        </button>
                      ),
                    )}
                  <button
                    className="rounded px-2 py-1 text-xs text-secondary hover:bg-qod-bg hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={page >= defectsData.totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
