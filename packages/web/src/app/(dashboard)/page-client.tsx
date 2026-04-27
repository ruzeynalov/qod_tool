'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import {
  BarChart3,
  FolderKanban,
  Shield,
  TrendingUp,
  TrendingDown,
  Minus,
  TestTube2,
  Bug,
  Zap,
  Clock,
} from 'lucide-react';
import { useProjects, useKPIDashboard } from '@/lib/api/hooks';
import { useDemoMode } from '@/app/_providers/demo-mode-provider';
import { apiClient } from '@/lib/api/client';
import {
  getDemoKPIDashboard,
  getDemoTestCases,
  getDemoDefects,
  type KPICard,
  type PaginatedResult,
} from '@/lib/demo/demo-data-provider';
import type { DemoTestCase, DemoDefect } from '@qod/shared';
import { cn } from '@/lib/utils/cn';

const METRIC_LABELS: Record<string, string> = {
  COVERAGE_PCT: 'Automation Coverage',
  PASS_RATE_7D: 'Pass Rate (7d)',
  PASS_RATE_30D: 'Pass Rate (30d)',
  FLAKY_RATE: 'Flaky Test Rate',
  MTTD_HOURS: 'Mean Time to Detect',
  MTTR_HOURS: 'Mean Time to Resolve',
  ESCAPE_RATE: 'Defect Escape Rate',
  EXEC_VELOCITY: 'Execution Velocity',
  DEFECT_DENSITY: 'Defect Density',
  READINESS_SCORE: 'Release Readiness',
  REQ_COVERAGE: 'Requirements Coverage',
};

const METRIC_ICONS: Record<string, React.ElementType> = {
  COVERAGE_PCT: BarChart3,
  PASS_RATE_7D: TrendingUp,
  PASS_RATE_30D: TrendingUp,
  FLAKY_RATE: Zap,
  MTTD_HOURS: Clock,
  MTTR_HOURS: Clock,
  ESCAPE_RATE: Bug,
  EXEC_VELOCITY: TestTube2,
  DEFECT_DENSITY: Bug,
  READINESS_SCORE: Shield,
  REQ_COVERAGE: BarChart3,
};

function formatKPIValue(metric: string, value: number): string {
  if (
    ['COVERAGE_PCT', 'PASS_RATE_7D', 'PASS_RATE_30D', 'FLAKY_RATE', 'ESCAPE_RATE', 'DEFECT_DENSITY', 'READINESS_SCORE', 'REQ_COVERAGE'].includes(metric)
  ) {
    return `${value.toFixed(1)}%`;
  }
  if (['MTTD_HOURS', 'MTTR_HOURS'].includes(metric)) {
    return value >= 24 ? `${(value / 24).toFixed(1)}d` : `${value.toFixed(1)}h`;
  }
  return value.toFixed(0);
}

function ragColor(rag: string) {
  if (rag === 'GREEN') return 'border-rag-green';
  if (rag === 'AMBER') return 'border-rag-amber';
  return 'border-rag-red';
}

function trendIcon(trend: string) {
  if (trend === 'UP') return <TrendingUp className="h-3.5 w-3.5 text-rag-green" />;
  if (trend === 'DOWN') return <TrendingDown className="h-3.5 w-3.5 text-rag-red" />;
  return <Minus className="h-3.5 w-3.5 text-muted" />;
}

// ── Aggregate data across all projects ────────────────────────────────

function useAggregatedData(projectIds: string[]) {
  const { demoMode } = useDemoMode();

  const kpiResults = useQueries({
    queries: projectIds.map((id) => ({
      queryKey: ['kpi-dashboard', id, { demoMode }],
      queryFn: async (): Promise<KPICard[]> => {
        if (demoMode) return getDemoKPIDashboard(id);
        try {
          return await apiClient<KPICard[]>(`/api/v1/projects/${id}/kpis`);
        } catch {
          return [];
        }
      },
      staleTime: 30_000,
    })),
  });

  const testCountResults = useQueries({
    queries: projectIds.map((id) => ({
      queryKey: ['test-cases-total', id, { demoMode }],
      queryFn: async (): Promise<number> => {
        if (demoMode) return getDemoTestCases(id, { pageSize: 1 }).total;
        try {
          const r = await apiClient<PaginatedResult<DemoTestCase>>(
            `/api/v1/projects/${id}/test-cases?pageSize=1`,
          );
          return r.total;
        } catch {
          return 0;
        }
      },
      staleTime: 30_000,
    })),
  });

  const defectCountResults = useQueries({
    queries: projectIds.map((id) => ({
      queryKey: ['defects-open', id, { demoMode }],
      queryFn: async (): Promise<number> => {
        if (demoMode) {
          const d = getDemoDefects(id);
          return d.items.filter((def) => ['OPEN', 'IN_PROGRESS', 'REOPENED'].includes(def.status)).length;
        }
        try {
          const summary = await apiClient<{ openDefects: number }>(
            `/api/v1/projects/${id}/summary`,
          );
          return summary.openDefects;
        } catch {
          return 0;
        }
      },
      staleTime: 30_000,
    })),
  });

  const allKPIs = kpiResults.flatMap((r) => r.data ?? []);
  const totalTestCases = testCountResults.reduce((sum, r) => sum + (r.data ?? 0), 0);
  const totalDefects = defectCountResults.reduce((sum, r) => sum + (r.data ?? 0), 0);
  const isLoading = [...kpiResults, ...testCountResults, ...defectCountResults].some(
    (r) => r.isLoading,
  );
  const isFetching = kpiResults.some((r) => r.isFetching);

  return { allKPIs, totalTestCases, totalDefects, isLoading, isFetching };
}

// ── Per-project row in the Projects list ──────────────────────────────

function ProjectKPISummary({ project }: { project: { id: string; name: string; description?: string | null } }) {
  const { data: kpis } = useKPIDashboard(project.id);
  const passRate = kpis?.find((k) => k.metric === 'PASS_RATE_7D');
  const coverage = kpis?.find((k) => k.metric === 'COVERAGE_PCT');

  return (
    <Link
      href={`/projects/${project.id}`}
      className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-qod-bg"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-qod-bg">
        <FolderKanban className="h-4 w-4 text-qod-accent" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-primary">{project.name}</p>
        {project.description && (
          <p className="truncate text-xs text-muted">{project.description}</p>
        )}
      </div>
      <div className="flex items-center gap-4 text-xs">
        {passRate && (
          <span className={cn('font-medium', passRate.ragStatus === 'GREEN' ? 'text-rag-green' : passRate.ragStatus === 'AMBER' ? 'text-rag-amber' : 'text-rag-red')}>
            {passRate.latestValue.toFixed(1)}% pass
          </span>
        )}
        {coverage && (
          <span className="text-secondary">
            {coverage.latestValue.toFixed(0)}% coverage
          </span>
        )}
      </div>
    </Link>
  );
}

// ── Main overview page ────────────────────────────────────────────────

export default function OverviewPage() {
  const { data: projects = [], isLoading: projectsLoading } = useProjects();
  const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);
  const { allKPIs, totalTestCases, totalDefects, isLoading: aggregateLoading, isFetching: kpiFetching } =
    useAggregatedData(projectIds);

  // Aggregate KPIs per metric across all projects (average value, worst-case RAG)
  const rollupKPIs = useMemo(() => {
    const metricMap = new Map<string, { values: number[]; rags: string[]; trends: string[] }>();
    for (const kpi of allKPIs) {
      // Skip metrics with no meaningful data or not useful in cross-project rollup
      if (kpi.hasData === false) continue;
      if (kpi.metric === 'EXEC_VELOCITY' || kpi.metric === 'MTTD_HOURS') continue;
      if (!metricMap.has(kpi.metric)) {
        metricMap.set(kpi.metric, { values: [], rags: [], trends: [] });
      }
      const entry = metricMap.get(kpi.metric)!;
      entry.values.push(kpi.latestValue);
      entry.rags.push(kpi.ragStatus);
      entry.trends.push(kpi.trend);
    }

    const result = Array.from(metricMap.entries()).map(([metric, { values, rags, trends }]) => {
      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      const worstRag = rags.includes('RED') ? 'RED' : rags.includes('AMBER') ? 'AMBER' : 'GREEN';
      const trendCounts: Record<string, number> = {};
      trends.forEach((t) => { trendCounts[t] = (trendCounts[t] || 0) + 1; });
      const dominantTrend = Object.entries(trendCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'FLAT';
      return { metric, latestValue: avg, ragStatus: worstRag, trend: dominantTrend };
    });

    // DEFECT_DENSITY now comes from the backend KPI snapshot per project
    // and is rolled up above like any other metric — no client-side push.

    // Enforce consistent ordering
    const ROLLUP_ORDER = ['COVERAGE_PCT', 'PASS_RATE_30D', 'FLAKY_RATE', 'MTTR_HOURS', 'ESCAPE_RATE', 'REQ_COVERAGE', 'READINESS_SCORE', 'DEFECT_DENSITY', 'PASS_RATE_7D'];
    const orderMap = new Map(ROLLUP_ORDER.map((m, i) => [m, i]));
    result.sort((a, b) => (orderMap.get(a.metric) ?? 999) - (orderMap.get(b.metric) ?? 999));

    return result;
  }, [allKPIs]);

  const avgPassRate = useMemo(() => {
    const rates = allKPIs.filter((k) => k.metric === 'PASS_RATE_7D').map((k) => k.latestValue);
    if (rates.length === 0) return null;
    return rates.reduce((s, v) => s + v, 0) / rates.length;
  }, [allKPIs]);

  const isLoading = projectsLoading || aggregateLoading;

  if (isLoading && projects.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-qod-accent border-t-transparent" />
      </div>
    );
  }

  const summaryCards = [
    { label: 'Active Projects', value: String(projects.length), icon: FolderKanban, color: 'text-qod-accent' },
    { label: 'Avg Pass Rate', value: avgPassRate != null ? `${avgPassRate.toFixed(1)}%` : '—', icon: TrendingUp, color: 'text-qod-accent' },
    { label: 'Open Defects', value: totalDefects > 0 ? String(totalDefects) : '—', icon: Bug, color: 'text-rag-amber' },
    { label: 'Total Test Cases', value: totalTestCases > 0 ? String(totalTestCases) : '—', icon: TestTube2, color: 'text-qod-accent' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-primary">Quality Observability Dashboard</h1>
        <p className="mt-1 text-sm text-muted">Cross-project quality metrics rollup</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="card flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-qod-bg">
              <card.icon className={cn('h-5 w-5', card.color)} />
            </div>
            <div>
              <p className="text-xs font-medium text-muted">{card.label}</p>
              <p className="text-xl font-semibold text-primary">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Cross-Project KPI Rollup */}
      {rollupKPIs.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-qod-border px-5 py-3">
            <h2 className="text-sm font-semibold text-primary">Cross-Project KPI Rollup</h2>
            <p className="text-xs text-muted">
              Aggregated averages across {projects.length} projects (worst-case RAG)
            </p>
          </div>
          <div className="grid grid-cols-1 gap-px bg-qod-border sm:grid-cols-2 lg:grid-cols-3">
            {rollupKPIs.map((kpi) => {
              const Icon = METRIC_ICONS[kpi.metric] ?? BarChart3;
              return (
                <div
                  key={kpi.metric}
                  className={cn(
                    'flex items-center gap-3 border-l-2 bg-qod-surface px-4 py-3',
                    ragColor(kpi.ragStatus),
                    kpiFetching && !aggregateLoading && 'animate-pulse',
                  )}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-qod-bg">
                    <Icon className="h-4 w-4 text-secondary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted">
                      {METRIC_LABELS[kpi.metric] ?? kpi.metric}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-lg font-semibold text-primary">
                        {formatKPIValue(kpi.metric, kpi.latestValue)}
                      </span>
                      {trendIcon(kpi.trend)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Project Quick Links */}
      <div className="card overflow-hidden">
        <div className="border-b border-qod-border px-5 py-3">
          <h2 className="text-sm font-semibold text-primary">Projects</h2>
        </div>
        {projects.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted">
            No projects yet. Create one via the API or enable demo mode.
          </div>
        ) : (
          <div className="divide-y divide-qod-border">
            {projects.map((project) => (
              <ProjectKPISummary key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
