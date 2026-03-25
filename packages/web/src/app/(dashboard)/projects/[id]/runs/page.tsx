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
  Legend,
  type TooltipProps,
} from 'recharts';
import {
  TrendingUp,
  AlertTriangle,
  List,
  GitBranch,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import {
  useTestRuns,
  usePassRateTrend,
  useFlakyTests,
  usePipelineRuns,
  useRerunStats,
} from '@/lib/api/hooks';
import dynamic from 'next/dynamic';

const PassRateTrend = dynamic(
  () => import('@/components/charts/pass-rate-trend').then((m) => m.PassRateTrend),
  { ssr: false },
);
const ExecutionTimeline = dynamic(
  () => import('@/components/charts/execution-timeline').then((m) => m.ExecutionTimeline),
  { ssr: false },
);
const FlakyTestsChart = dynamic(
  () => import('@/components/charts/flaky-tests-chart').then((m) => m.FlakyTestsChart),
  { ssr: false },
);
import {
  Card,
  Badge,
  Button,
  Spinner,
  StatCard,
  DataTable,
  Select,
  Tabs,
} from '@/components/ui';
import { useChartColors } from '@/lib/hooks/use-chart-colors';
import type { DataTableColumn } from '@/components/ui/data-table';
import type { DemoTestRun, DemoPipelineRun } from '@qod/shared';
import type { FlakyTest, DailyPassRate } from '@/lib/demo/demo-data-provider';
import { TestHistoryDrawer } from '@/components/test-history-drawer';
import { formatDuration, formatRelativeTime } from '@/lib/utils/format';

// ── Helpers ────────────────────────────────────────────────────────────

type PeriodDays = 7 | 30 | 90;

const PERIOD_OPTIONS: { label: string; value: PeriodDays }[] = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
];

const TRIGGER_LABELS: Record<string, string> = {
  CI_PUSH: 'CI',
  PR: 'PR',
  SCHEDULE: 'Schedule',
  MANUAL: 'Manual',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'PASSED', label: 'Passed' },
  { value: 'FAILED', label: 'Failed' },
];

const TRIGGER_OPTIONS = [
  { value: '', label: 'All triggers' },
  { value: 'CI_PUSH', label: 'CI' },
  { value: 'PR', label: 'PR' },
  { value: 'SCHEDULE', label: 'Schedule' },
  { value: 'MANUAL', label: 'Manual' },
];

// ── Tab definitions ────────────────────────────────────────────────────

const TABS = [
  { id: 'charts', label: 'Charts & Trends', icon: <TrendingUp className="h-4 w-4" /> },
  { id: 'flaky', label: 'Flaky Tests', icon: <AlertTriangle className="h-4 w-4" /> },
  { id: 'runs', label: 'Run History', icon: <List className="h-4 w-4" /> },
];

// ── Period Selector ────────────────────────────────────────────────────

function PeriodSelector({
  value,
  onChange,
}: {
  value: PeriodDays;
  onChange: (v: PeriodDays) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {PERIOD_OPTIONS.map((opt) => (
        <Button
          key={opt.value}
          size="sm"
          variant={value === opt.value ? 'primary' : 'ghost'}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

// ── Section: Pass Rate Trend ───────────────────────────────────────────

function PassRateSection({ projectId }: { projectId: string }) {
  const [period, setPeriod] = useState<PeriodDays>(30);
  const { data, isLoading } = usePassRateTrend(projectId, period);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.map((d) => ({
      date: d.date.slice(5), // MM-DD
      passRate: d.passRate,
      target: 90,
    }));
  }, [data]);

  return (
    <Card padding="sm">
      <div className="flex items-center justify-between px-2 pb-2">
        <h3 className="text-sm font-semibold text-primary">Pass Rate Trend</h3>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>
      <div className="h-64">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <PassRateTrend data={chartData} />
        )}
      </div>
    </Card>
  );
}

// ── Section: Execution Timeline ────────────────────────────────────────

function ExecutionTimelineSection({ projectId }: { projectId: string }) {
  const [period, setPeriod] = useState<PeriodDays>(30);
  const { data, isLoading } = usePassRateTrend(projectId, period);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.map((d: DailyPassRate) => ({
      date: d.date.slice(5),
      passed: d.passedRuns,
      failed: d.failedRuns,
      skipped: d.totalRuns - d.passedRuns - d.failedRuns,
    }));
  }, [data]);

  return (
    <Card padding="sm">
      <div className="flex items-center justify-between px-2 pb-2">
        <h3 className="text-sm font-semibold text-primary">Execution Timeline</h3>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>
      <div className="h-64">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <ExecutionTimeline data={chartData} />
        )}
      </div>
    </Card>
  );
}

// ── Section: Flaky Tests ───────────────────────────────────────────────

function flakyBadgeVariant(rate: number): 'error' | 'warning' | 'success' {
  if (rate > 50) return 'error';
  if (rate > 20) return 'warning';
  return 'success';
}

function FlakyTestsSection({ projectId }: { projectId: string }) {
  const { data: flakyTests, isLoading } = useFlakyTests(projectId);
  const [drawerTestId, setDrawerTestId] = useState<string | null>(null);
  const [drawerTestTitle, setDrawerTestTitle] = useState('');

  const chartData = useMemo(() => {
    if (!flakyTests) return [];
    return flakyTests.slice(0, 10).map((t) => ({
      name: t.testTitle,
      flakinessScore: t.flakyRate,
      totalRuns: t.totalExecutions,
    }));
  }, [flakyTests]);

  const flakyColumns: DataTableColumn<FlakyTest>[] = useMemo(
    () => [
      {
        key: 'testTitle',
        header: 'Test Name',
        className: 'max-w-xs',
        render: (row: FlakyTest) => (
          <button
            type="button"
            className="truncate block max-w-xs text-left text-qod-accent hover:underline"
            title={row.testTitle}
            onClick={(e) => {
              e.stopPropagation();
              setDrawerTestId(row.testCaseId);
              setDrawerTestTitle(row.testTitle);
            }}
          >
            {row.testTitle}
          </button>
        ),
      },
      {
        key: 'flakyRate',
        header: 'Flakiness',
        sortable: true,
        render: (row: FlakyTest) => (
          <Badge variant={flakyBadgeVariant(row.flakyRate)}>
            {row.flakyRate.toFixed(1)}%
          </Badge>
        ),
      },
      {
        key: 'totalExecutions',
        header: 'Total Runs',
        sortable: true,
        render: (row: FlakyTest) => (
          <span className="text-secondary">{row.totalExecutions}</span>
        ),
      },
      {
        key: 'flakyCount',
        header: 'Flaky Count',
        sortable: true,
        render: (row: FlakyTest) => (
          <span className="text-secondary">{row.flakyCount}</span>
        ),
      },
      {
        key: 'lastFlakyAt',
        header: 'Last Flaky',
        sortable: true,
        render: (row: FlakyTest) => (
          <span className="text-xs text-muted">
            {formatRelativeTime(row.lastFlakyAt)}
          </span>
        ),
      },
    ],
    [],
  );

  if (isLoading) {
    return (
      <Card>
        <div className="flex h-64 items-center justify-center">
          <Spinner />
        </div>
      </Card>
    );
  }

  if (!flakyTests || flakyTests.length === 0) {
    return (
      <Card padding="md">
        <h3 className="mb-3 text-sm font-semibold text-primary">Flaky Tests</h3>
        <p className="text-sm text-muted">No flaky tests detected.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card padding="sm">
        <div className="px-2 pb-2">
          <h3 className="text-sm font-semibold text-primary">Flaky Tests</h3>
        </div>
        <div className="h-72">
          <FlakyTestsChart data={chartData} />
        </div>
      </Card>

      <Card padding="sm">
        <div className="px-2 pb-2">
          <h3 className="text-sm font-semibold text-primary">
            Flaky Test Details ({flakyTests.length})
          </h3>
        </div>
        <DataTable
          columns={flakyColumns as any}
          data={flakyTests as any}
          defaultSort={{ key: 'lastFlakyAt', direction: 'desc' }}
        />
      </Card>

      <TestHistoryDrawer
        isOpen={!!drawerTestId}
        onClose={() => setDrawerTestId(null)}
        projectId={projectId}
        testCaseId={drawerTestId}
        testTitle={drawerTestTitle}
      />
    </div>
  );
}

// ── Section: Run History Table ─────────────────────────────────────────

function RunHistorySection({ projectId }: { projectId: string }) {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [triggerFilter, setTriggerFilter] = useState('');

  // Fetch all runs (using a large page) so we can client-side filter by trigger type
  const { data, isLoading } = useTestRuns(projectId, {
    status: (statusFilter || undefined) as DemoTestRun['status'] | undefined,
    branch: branchFilter || undefined,
    page: 1,
    pageSize: 1000,
  });

  // Extract unique branches for filter dropdown
  const branchOptions = useMemo(() => {
    if (!data?.items) return [{ value: '', label: 'All branches' }];
    const branches = [...new Set(data.items.map((r) => r.branch))].sort();
    return [
      { value: '', label: 'All branches' },
      ...branches.map((b) => ({ value: b, label: b })),
    ];
  }, [data]);

  // Apply client-side trigger filter and pagination
  const filteredData = useMemo(() => {
    if (!data?.items) return { items: [], total: 0 };
    let items = data.items;

    if (triggerFilter) {
      items = items.filter((r) => r.triggerType === triggerFilter);
    }

    return { items, total: items.length };
  }, [data, triggerFilter]);

  const pageSize = 20;
  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredData.items.slice(start, start + pageSize);
  }, [filteredData.items, page]);

  // Reset page when filters change
  const handleStatusChange = (v: string) => { setStatusFilter(v); setPage(1); };
  const handleBranchChange = (v: string) => { setBranchFilter(v); setPage(1); };
  const handleTriggerChange = (v: string) => { setTriggerFilter(v); setPage(1); };

  const columns: DataTableColumn<DemoTestRun>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Name',
        className: 'min-w-[160px]',
        render: (row: DemoTestRun) => (
          <span className="font-medium text-primary inline-flex items-center gap-2">
            {row.name}
            {row.isRerun && <Badge variant="warning">Re-run</Badge>}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (row: DemoTestRun) => (
          <Badge variant={row.status === 'PASSED' ? 'success' : 'error'}>
            {row.status}
          </Badge>
        ),
      },
      {
        key: 'branch',
        header: 'Branch',
        render: (row: DemoTestRun) => (
          <span className="inline-flex items-center gap-1 text-xs text-secondary">
            <GitBranch className="h-3 w-3" />
            {row.branch}
          </span>
        ),
      },
      {
        key: 'environment',
        header: 'Env',
        render: (row: DemoTestRun) => (
          <span className="text-xs text-secondary">{row.environment}</span>
        ),
      },
      {
        key: 'triggerType',
        header: 'Trigger',
        render: (row: DemoTestRun) => {
          const variant =
            row.triggerType === 'CI_PUSH'
              ? 'info'
              : row.triggerType === 'PR'
                ? 'demo'
                : row.triggerType === 'SCHEDULE'
                  ? 'warning'
                  : 'neutral';
          return (
            <Badge variant={variant}>
              {TRIGGER_LABELS[row.triggerType] ?? row.triggerType}
            </Badge>
          );
        },
      },
      {
        key: 'durationMs',
        header: 'Duration',
        sortable: true,
        render: (row: DemoTestRun) => (
          <span className="text-xs text-secondary">{formatDuration(row.durationMs)}</span>
        ),
      },
      {
        key: 'totalTests',
        header: 'Tests',
        render: (row: DemoTestRun) => (
          <span className="text-xs">
            <span className="text-rag-green">{row.passedCount}</span>
            <span className="text-muted"> / </span>
            <span className="text-rag-red">{row.failedCount}</span>
            <span className="text-muted"> / </span>
            <span className="text-secondary">{row.skippedCount}</span>
          </span>
        ),
      },
      {
        key: 'startedAt',
        header: 'Date',
        sortable: true,
        render: (row: DemoTestRun) => {
          const d = new Date(row.startedAt);
          return (
            <div className="text-xs">
              <span className="text-secondary">
                {d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
              <span className="text-muted ml-1">
                ({formatRelativeTime(row.startedAt)})
              </span>
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <Card padding="sm">
      <div className="flex flex-wrap items-center gap-3 px-2 pb-3">
        <h3 className="text-sm font-semibold text-primary">Run History</h3>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={handleStatusChange}
            className="w-36"
          />
          <Select
            options={branchOptions}
            value={branchFilter}
            onChange={handleBranchChange}
            className="w-44"
          />
          <Select
            options={TRIGGER_OPTIONS}
            value={triggerFilter}
            onChange={handleTriggerChange}
            className="w-36"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <DataTable
          columns={columns as any}
          data={paginatedItems as any}
          onRowClick={() => {
            // Future drill-down
          }}
          emptyMessage="No test runs match the current filters."
          pagination={{
            page,
            pageSize,
            total: filteredData.total,
            onPageChange: setPage,
          }}
        />
      )}
    </Card>
  );
}

// ── Section: Pipeline Runs (collapsible) ───────────────────────────────

function PipelineRunsSection({ projectId }: { projectId: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data: pipelineRuns, isLoading } = usePipelineRuns(projectId);

  const columns: DataTableColumn<DemoPipelineRun>[] = useMemo(
    () => [
      {
        key: 'workflowName',
        header: 'Workflow',
        render: (row: DemoPipelineRun) => (
          <span className="font-medium text-primary">{row.workflowName}</span>
        ),
      },
      {
        key: 'branch',
        header: 'Branch',
        render: (row: DemoPipelineRun) => (
          <span className="inline-flex items-center gap-1 text-xs text-secondary">
            <GitBranch className="h-3 w-3" />
            {row.branch}
          </span>
        ),
      },
      {
        key: 'sha',
        header: 'SHA',
        render: (row: DemoPipelineRun) => (
          <code className="rounded bg-qod-bg px-1.5 py-0.5 text-xs text-secondary font-mono">
            {row.sha.slice(0, 7)}
          </code>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (row: DemoPipelineRun) => (
          <Badge variant={row.status === 'SUCCESS' ? 'success' : 'error'}>
            {row.status}
          </Badge>
        ),
      },
      {
        key: 'durationMs',
        header: 'Duration',
        sortable: true,
        render: (row: DemoPipelineRun) => (
          <span className="text-xs text-secondary">{formatDuration(row.durationMs)}</span>
        ),
      },
      {
        key: 'triggeredBy',
        header: 'Triggered By',
        render: (row: DemoPipelineRun) => (
          <span className="text-xs text-secondary">{row.triggeredBy}</span>
        ),
      },
      {
        key: 'startedAt',
        header: 'Started',
        sortable: true,
        render: (row: DemoPipelineRun) => (
          <span className="text-xs text-muted">
            {formatRelativeTime(row.startedAt)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <Card padding="sm">
      <button
        className="flex w-full items-center gap-2 px-2 py-1 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted" />
        )}
        <h3 className="text-sm font-semibold text-primary">Pipeline Runs</h3>
        {pipelineRuns && (
          <span className="text-xs text-muted">({pipelineRuns.length})</span>
        )}
      </button>

      {expanded && (
        <div className="mt-2">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <DataTable
              columns={columns as any}
              data={(pipelineRuns ?? []) as any}
              emptyMessage="No pipeline runs available."
            />
          )}
        </div>
      )}
    </Card>
  );
}

// ── Section: Re-run Analysis ────────────────────────────────────────────

function RerunTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-qod-border bg-qod-surface px-3 py-2 shadow-lg">
      <p className="text-xs text-muted">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-sm font-medium text-primary">
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

function RerunAnalysisSection({ projectId }: { projectId: string }) {
  const { data: rerunStats, isLoading } = useRerunStats(projectId);
  const chartColors = useChartColors();

  const hasReruns = (rerunStats?.rerunCount ?? 0) > 0;

  const chartData = useMemo(() => {
    if (!rerunStats) return [];
    return rerunStats.rerunsByDay.slice(-14).map((d: any) => ({
      date: d.date.slice(5), // MM-DD
      ...(hasReruns
        ? { 'Original Runs': d.original, 'Re-runs': d.reruns }
        : { 'Passed': d.passed ?? d.original, 'Failed': d.failed ?? 0 }),
    }));
  }, [rerunStats, hasReruns]);

  if (isLoading) {
    return (
      <Card>
        <div className="flex h-64 items-center justify-center">
          <Spinner />
        </div>
      </Card>
    );
  }

  if (!rerunStats) return null;

  const totalPassed = rerunStats.totalRuns - Math.round(rerunStats.originalFailRate * rerunStats.totalRuns / 100);
  const totalFailed = rerunStats.totalRuns - totalPassed;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
        {hasReruns ? (
          <><RefreshCw className="h-4 w-4 text-muted" /> Re-run Analysis</>
        ) : (
          <><TrendingUp className="h-4 w-4 text-muted" /> Run Health (30d)</>
        )}
      </h3>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {hasReruns ? (
          <>
            <StatCard
              title="Re-run Rate"
              value={`${rerunStats.rerunRate}%`}
              icon={<RefreshCw className="h-4 w-4" />}
              ragStatus={
                rerunStats.rerunRate > 25
                  ? 'red'
                  : rerunStats.rerunRate > 10
                    ? 'amber'
                    : 'green'
              }
              subtitle="of all runs are re-runs"
            />
            <StatCard
              title="Original Fail Rate"
              value={`${rerunStats.originalFailRate}%`}
              ragStatus={
                rerunStats.originalFailRate > 30
                  ? 'red'
                  : rerunStats.originalFailRate > 15
                    ? 'amber'
                    : 'green'
              }
              subtitle="first-attempt failures"
            />
            <StatCard
              title="Masked Fail Rate"
              value={`${rerunStats.maskedFailRate}%`}
              ragStatus={
                rerunStats.maskedFailRate > 20
                  ? 'red'
                  : rerunStats.maskedFailRate > 10
                    ? 'amber'
                    : 'green'
              }
              subtitle="failures after re-runs"
            />
            <StatCard
              title="Total Re-runs"
              value={rerunStats.rerunCount}
              subtitle={`of ${rerunStats.totalRuns} total runs`}
            />
          </>
        ) : (
          <>
            <StatCard
              title="Total Runs"
              value={rerunStats.totalRuns}
              subtitle="in the last 30 days"
            />
            <StatCard
              title="Fail Rate"
              value={`${rerunStats.originalFailRate}%`}
              ragStatus={
                rerunStats.originalFailRate > 30
                  ? 'red'
                  : rerunStats.originalFailRate > 15
                    ? 'amber'
                    : 'green'
              }
              subtitle="of runs failed"
            />
            <StatCard
              title="Passed Runs"
              value={totalPassed}
              ragStatus="green"
              subtitle="successful executions"
            />
            <StatCard
              title="Failed Runs"
              value={totalFailed}
              ragStatus={totalFailed > 0 ? 'red' : 'green'}
              subtitle="failed executions"
            />
          </>
        )}
      </div>

      {/* Stacked bar chart */}
      <Card padding="sm">
        <div className="px-2 pb-2">
          <h4 className="text-sm font-semibold text-primary">
            {hasReruns ? 'Runs vs Re-runs by Day' : 'Daily Run Results'}
          </h4>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
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
              <RechartsTooltip content={<RerunTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: '12px', color: chartColors.axis }}
              />
              {hasReruns ? (
                <>
                  <Bar dataKey="Original Runs" stackId="runs" fill={chartColors.accent} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Re-runs" stackId="runs" fill={chartColors.amber} radius={[4, 4, 0, 0]} />
                </>
              ) : (
                <>
                  <Bar dataKey="Passed" stackId="runs" fill={chartColors.green} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Failed" stackId="runs" fill={chartColors.red} radius={[4, 4, 0, 0]} />
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────

export default function RunsPage() {
  const params = useParams();
  const projectId = (params?.id ?? '') as string;
  const [activeTab, setActiveTab] = useState('charts');

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div>
        <h1 className="text-lg font-semibold text-primary">Automation Runs</h1>
        <p className="text-xs text-muted">
          Test execution history, pass rate trends, and flaky test analysis
        </p>
      </div>

      {/* Tab navigation */}
      <Tabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Tab content */}
      {activeTab === 'charts' && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <PassRateSection projectId={projectId} />
            <ExecutionTimelineSection projectId={projectId} />
          </div>
          <RerunAnalysisSection projectId={projectId} />
          <PipelineRunsSection projectId={projectId} />
        </div>
      )}

      {activeTab === 'flaky' && <FlakyTestsSection projectId={projectId} />}

      {activeTab === 'runs' && <RunHistorySection projectId={projectId} />}
    </div>
  );
}
