'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  TestTube2,
  Bug,
  TrendingUp,
  BarChart3,
  Clock,
  Activity,
  Download,
  FileText,
  FileSpreadsheet,
  ChevronDown,
  GitBranch,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Timer,
  Zap,
  Shield,
  Rocket,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatDuration, formatRelativeTime } from '@/lib/utils/format';
import { useProject, useKPIDashboard, useTestRuns, useDefects, useCoverageData, useRerunStats, useFlakyTests, useDefectFilterOptions } from '@/lib/api/hooks';

// ── CSV Export helpers ─────────────────────────────────────────────────

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function ExportPdfButton({ projectId }: { projectId: string }) {
  const { data: project } = useProject(projectId);
  const { data: kpis = [] } = useKPIDashboard(projectId);
  const { data: runsData } = useTestRuns(projectId, { pageSize: 1000 });
  const { data: defectsData } = useDefects(projectId, { pageSize: 1000 });
  const { data: coverageData } = useCoverageData(projectId);
  const { data: rerunStats } = useRerunStats(projectId);
  const { data: flakyTests } = useFlakyTests(projectId);

  const handleExport = useCallback(() => {
    const defects = defectsData?.items ?? [];
    const coverage = coverageData ?? [];
    const flaky = flakyTests ?? [];
    const now = new Date().toLocaleString();
    const projectName = project?.name ?? 'Project';

    // Use KPI values as source of truth (matches what user sees in dashboard)
    const kpiPassRate = kpis.find((k) => k.metric === 'PASS_RATE_7D');
    const kpiCoverage = kpis.find((k) => k.metric === 'COVERAGE_PCT');
    const kpiFlakyRate = kpis.find((k) => k.metric === 'FLAKY_RATE');

    // Use .total from paginated results for accurate counts
    const totalRuns = runsData?.total ?? 0;
    const totalDefects = defectsData?.total ?? 0;
    const openDefects = defects.filter((d) => ['OPEN', 'IN_PROGRESS', 'REOPENED'].includes(d.status)).length;
    const criticalDefects = defects.filter((d) => d.severity === 'CRITICAL').length;
    const totalTestCases = coverage.reduce((s, c) => s + c.totalTestCases, 0);

    const ragBg = (s: string) => s === 'GREEN' ? '#dcfce7' : s === 'AMBER' ? '#fef3c7' : '#fee2e2';
    const ragFg = (s: string) => s === 'GREEN' ? '#15803d' : s === 'AMBER' ? '#a16207' : '#dc2626';

    const kpiRows = kpis.map((k) => {
      const label = OVERVIEW_LABELS[k.metric] ?? k.metric;
      const value = k.hasData === false ? 'N/A' : formatOverviewKPI(k.metric, k.latestValue);
      return `<tr><td>${label}</td><td class="val-cell">${value}</td><td><span class="badge" style="background:${ragBg(k.ragStatus)};color:${ragFg(k.ragStatus)}">${k.ragStatus}</span></td></tr>`;
    }).join('');

    const defectSeverity: Record<string, number> = {};
    defects.forEach((d) => { defectSeverity[d.severity] = (defectSeverity[d.severity] || 0) + 1; });
    const sevColors: Record<string, string> = { CRITICAL: '#dc2626', HIGH: '#ea580c', MEDIUM: '#ca8a04', LOW: '#16a34a' };
    const severityRows = Object.entries(defectSeverity)
      .sort((a, b) => b[1] - a[1])
      .map(([sev, count]) => `<tr><td><span class="sev-dot" style="background:${sevColors[sev] ?? '#94a3b8'}"></span>${sev}</td><td>${count}</td><td><div class="bar-track"><div class="bar-fill" style="width:${totalDefects > 0 ? Math.round((count / totalDefects) * 100) : 0}%;background:${sevColors[sev] ?? '#94a3b8'}"></div></div></td></tr>`)
      .join('');

    const topCoverage = coverage.slice(0, 15).map((c) => {
      const pct = Math.round(c.automationPct);
      const color = pct >= 80 ? '#16a34a' : pct >= 50 ? '#ca8a04' : '#dc2626';
      return `<tr><td>${c.featureAreaName}</td><td>${c.automatedCount} / ${c.totalTestCases}</td><td><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div></td><td style="color:${color};font-weight:600">${pct}%</td></tr>`;
    }).join('');

    const runs = runsData?.items ?? [];
    // Match Run Health semantics: FAILED, ERRORED, and CANCELLED are all
    // "not green". Filtering only FAILED here would omit timed-out and
    // cancelled CI runs from the report even though they count against
    // Run Health on the dashboard.
    const recentFailed = runs.filter((r) => r.status === 'FAILED' || r.status === 'ERRORED' || r.status === 'CANCELLED').slice(0, 10).map((r) =>
      `<tr><td>${r.name ?? r.id.slice(0, 8)}</td><td><code>${r.branch ?? '—'}</code></td><td><span style="color:#dc2626;font-weight:600">${r.failedCount}</span> / ${r.totalTests}</td><td>${new Date(r.startedAt).toLocaleDateString()}</td></tr>`
    ).join('');

    const flakyRows = flaky.slice(0, 10).map((t) => {
      const color = t.flakyRate > 50 ? '#dc2626' : t.flakyRate > 20 ? '#ca8a04' : '#16a34a';
      return `<tr><td>${t.testTitle.length > 60 ? t.testTitle.slice(0, 57) + '...' : t.testTitle}</td><td style="color:${color};font-weight:600">${t.flakyRate.toFixed(1)}%</td><td>${t.totalExecutions}</td></tr>`;
    }).join('');

    // Source executive summary values from KPIs (matches dashboard) with fallbacks
    const passRatePct = kpiPassRate ? Math.round(kpiPassRate.latestValue * 10) / 10 : 0;
    const automationPct = kpiCoverage ? Math.round(kpiCoverage.latestValue * 10) / 10 : 0;
    const flakyRatePct = kpiFlakyRate ? Math.round(kpiFlakyRate.latestValue * 10) / 10 : 0;
    const passRateRag = kpiPassRate?.ragStatus ?? 'NONE';
    const coverageRag = kpiCoverage?.ragStatus ?? 'NONE';
    const flakyRag = kpiFlakyRate?.ragStatus ?? 'NONE';

    const ragToColor = (rag: string) => rag === 'GREEN' ? 'green' : rag === 'AMBER' ? 'amber' : 'red';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${projectName} - Quality Report</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;color:#1e293b;font-size:13px;line-height:1.6;background:#f8fafc}
.page{max-width:960px;margin:0 auto;padding:40px}
.header{background:linear-gradient(135deg,#1e293b 0%,#334155 100%);color:#fff;border-radius:12px;padding:28px 32px;margin-bottom:28px}
.header h1{font-size:24px;font-weight:700;margin-bottom:4px}
.header .sub{color:#94a3b8;font-size:13px}
.header .date{color:#cbd5e1;font-size:12px;margin-top:8px}
h2{font-size:15px;font-weight:700;color:#1e293b;margin:28px 0 14px;display:flex;align-items:center;gap:8px}
h2::before{content:'';display:inline-block;width:4px;height:18px;background:linear-gradient(180deg,#6366f1,#8b5cf6);border-radius:2px}
.section{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:20px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
.stat{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center;position:relative;overflow:hidden}
.stat::before{content:'';position:absolute;top:0;left:0;right:0;height:3px}
.stat.blue::before{background:linear-gradient(90deg,#3b82f6,#6366f1)}
.stat.green::before{background:linear-gradient(90deg,#22c55e,#16a34a)}
.stat.amber::before{background:linear-gradient(90deg,#f59e0b,#eab308)}
.stat.red::before{background:linear-gradient(90deg,#ef4444,#dc2626)}
.stat.purple::before{background:linear-gradient(90deg,#8b5cf6,#a855f7)}
.stat .val{font-size:26px;font-weight:800;color:#1e293b;letter-spacing:-0.5px}
.stat .lbl{font-size:11px;font-weight:500;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:9px 12px;font-size:12px}
th{background:#f8fafc;font-weight:600;font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:0.3px;border-bottom:2px solid #e2e8f0}
td{border-bottom:1px solid #f1f5f9}
tr:hover td{background:#f8fafc}
.val-cell{font-weight:700;font-size:13px;color:#1e293b}
.badge{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.3px}
.sev-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}
.bar-track{width:100px;height:8px;background:#f1f5f9;border-radius:4px;overflow:hidden;display:inline-block;vertical-align:middle}
.bar-fill{height:100%;border-radius:4px;transition:width 0.3s}
code{background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:11px;color:#475569}
.footer{text-align:center;color:#94a3b8;font-size:11px;margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0}
@media print{body{background:#fff}.page{padding:20px}.header{-webkit-print-color-adjust:exact;print-color-adjust:exact}.stat::before{-webkit-print-color-adjust:exact;print-color-adjust:exact}.badge{-webkit-print-color-adjust:exact;print-color-adjust:exact}.sev-dot{-webkit-print-color-adjust:exact;print-color-adjust:exact}.bar-fill{-webkit-print-color-adjust:exact;print-color-adjust:exact}h2{page-break-after:avoid}.section{page-break-inside:avoid}tr{page-break-inside:avoid}}
</style></head><body>
<div class="page">

<div class="header">
<h1>${projectName}</h1>
<div class="sub">Quality Status Report</div>
<div class="date">Generated ${now}</div>
</div>

<h2>Executive Summary</h2>
<div class="grid">
<div class="stat blue"><div class="val">${totalTestCases.toLocaleString()}</div><div class="lbl">Test Cases</div></div>
<div class="stat ${ragToColor(coverageRag)}"><div class="val">${automationPct}%</div><div class="lbl">Automation Coverage</div></div>
<div class="stat purple"><div class="val">${totalRuns.toLocaleString()}</div><div class="lbl">Test Runs</div></div>
<div class="stat ${ragToColor(passRateRag)}"><div class="val">${passRatePct}%</div><div class="lbl">Pass Rate (7d)</div></div>
</div>
<div class="grid">
<div class="stat blue"><div class="val">${totalDefects}</div><div class="lbl">Total Defects</div></div>
<div class="stat ${openDefects > 10 ? 'red' : openDefects > 5 ? 'amber' : 'green'}"><div class="val">${openDefects}</div><div class="lbl">Open Defects</div></div>
<div class="stat ${criticalDefects > 0 ? 'red' : 'green'}"><div class="val">${criticalDefects}</div><div class="lbl">Critical Defects</div></div>
<div class="stat ${ragToColor(flakyRag)}"><div class="val">${flakyRatePct}%</div><div class="lbl">Flaky Rate</div></div>
</div>

<h2>KPI Dashboard</h2>
<div class="section">
<table><thead><tr><th>Metric</th><th>Value</th><th>Status</th></tr></thead><tbody>${kpiRows || '<tr><td colspan="3">No KPI data available</td></tr>'}</tbody></table>
</div>

<h2>Defect Breakdown by Severity</h2>
<div class="section">
<table><thead><tr><th>Severity</th><th>Count</th><th>Distribution</th></tr></thead><tbody>${severityRows || '<tr><td colspan="3">No defects recorded</td></tr>'}</tbody></table>
</div>

<h2>Coverage by Feature Area</h2>
<div class="section">
<table><thead><tr><th>Feature Area</th><th>Automated / Total</th><th>Progress</th><th>Coverage</th></tr></thead><tbody>${topCoverage || '<tr><td colspan="4">No coverage data available</td></tr>'}</tbody></table>
${coverage.length > 15 ? `<p style="color:#64748b;font-size:11px;margin-top:8px;text-align:center">Showing top 15 of ${coverage.length} feature areas</p>` : ''}
</div>

${recentFailed ? `<h2>Recent Failed Runs</h2>
<div class="section">
<table><thead><tr><th>Run Name</th><th>Branch</th><th>Failed / Total</th><th>Date</th></tr></thead><tbody>${recentFailed}</tbody></table>
</div>` : ''}

${flakyRows ? `<h2>Top Flaky Tests</h2>
<div class="section">
<table><thead><tr><th>Test Case</th><th>Flaky Rate</th><th>Executions</th></tr></thead><tbody>${flakyRows}</tbody></table>
</div>` : ''}

${rerunStats && rerunStats.totalRuns > 0 ? (() => {
      const rs = rerunStats;
      const rsPassed = rs.rerunsByDay.reduce((s, d) => s + (d.passed ?? 0), 0);
      const rsFailed = rs.rerunsByDay.reduce((s, d) => s + (d.failed ?? 0), 0);
      return `<h2>Run Health (Last 30 Days)</h2>
<div class="grid">
<div class="stat blue"><div class="val">${rs.totalRuns}</div><div class="lbl">Total Runs</div></div>
<div class="stat ${rs.originalFailRate > 30 ? 'red' : rs.originalFailRate > 15 ? 'amber' : 'green'}"><div class="val">${rs.originalFailRate}%</div><div class="lbl">Fail Rate</div></div>
<div class="stat ${rsPassed > 0 ? 'green' : 'blue'}"><div class="val">${rsPassed}</div><div class="lbl">Passed Runs</div></div>
<div class="stat ${rsFailed > 0 ? 'red' : 'green'}"><div class="val">${rsFailed}</div><div class="lbl">Failed Runs</div></div>
</div>`;
    })() : ''}

<div class="footer">
QOD Quality Observability Dashboard &mdash; Report generated automatically
</div>

</div>
</body></html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 500);
    }
  }, [project, kpis, runsData, defectsData, coverageData, rerunStats, flakyTests]);

  return (
    <button
      onClick={handleExport}
      className="inline-flex items-center gap-2 rounded-lg border border-qod-border bg-qod-surface px-3 py-1.5 text-sm font-medium text-secondary transition-colors hover:bg-qod-bg hover:text-primary"
    >
      <FileText className="h-4 w-4" />
      Export PDF
    </button>
  );
}

const OVERVIEW_LABELS: Record<string, string> = {
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

const OVERVIEW_ICONS: Record<string, React.ElementType> = {
  COVERAGE_PCT: BarChart3,
  PASS_RATE_7D: TrendingUp,
  PASS_RATE_30D: TrendingUp,
  FLAKY_RATE: Zap,
  MTTD_HOURS: Clock,
  MTTR_HOURS: Clock,
  ESCAPE_RATE: Bug,
  DEFECT_DENSITY: Bug,
  READINESS_SCORE: Shield,
  REQ_COVERAGE: BarChart3,
};

function ragBorderColor(rag: string) {
  if (rag === 'GREEN') return 'border-rag-green';
  if (rag === 'AMBER') return 'border-rag-amber';
  return 'border-rag-red';
}

function formatOverviewKPI(metric: string, value: number): string {
  if (['COVERAGE_PCT', 'PASS_RATE_7D', 'PASS_RATE_30D', 'FLAKY_RATE', 'ESCAPE_RATE', 'READINESS_SCORE', 'REQ_COVERAGE', 'DEFECT_DENSITY'].includes(metric)) {
    return `${value.toFixed(1)}%`;
  }
  if (metric === 'MTTR_HOURS') {
    return value >= 48 ? `${(value / 24).toFixed(1)}d` : `${value.toFixed(1)}h`;
  }
  if (metric === 'MTTD_HOURS') {
    return `${value.toFixed(1)}h`;
  }
  if (metric === 'EXEC_VELOCITY') {
    return value.toFixed(1);
  }
  return value.toFixed(1);
}

// ── Main Page ──────────────────────────────────────────────────────────

export default function ProjectOverviewPage() {
  const params = useParams();
  const projectId = (params?.id ?? '') as string;
  const { data: project } = useProject(projectId);
  const { data: kpis = [], isFetching: kpiFetching } = useKPIDashboard(projectId);
  const { data: runsData, isLoading: runsLoading } = useTestRuns(projectId, { pageSize: 10 });
  const { data: coverageData } = useCoverageData(projectId);
  const { data: defectFilterOpts } = useDefectFilterOptions(projectId);
  const recentRuns = runsData?.items ?? [];

  // Compute Defect Density: (open defects / total test cases) × 100
  const totalTestCases = useMemo(
    () => (coverageData ?? []).reduce((s, c) => s + c.totalTestCases, 0),
    [coverageData],
  );
  const openDefectCount = defectFilterOpts?.openCount ?? 0;

  // Build display KPIs: enforce consistent 3×3 grid order matching cross-project rollup
  const OVERVIEW_KPI_ORDER = [
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
  const displayKpis = useMemo(() => {
    // DEFECT_DENSITY now comes from the backend KPI snapshot (authoritative
    // source used by the alert engine). The previous client-side computation
    // was removed to avoid a duplicate card.
    const filtered = kpis.filter((k) => k.metric !== 'EXEC_VELOCITY' && k.metric !== 'MTTD_HOURS');
    // Sort by explicit order to ensure both demo and real modes show the same card arrangement
    const orderMap = new Map(OVERVIEW_KPI_ORDER.map((m, i) => [m, i]));
    return filtered.slice().sort((a, b) => {
      const ia = orderMap.get(a.metric) ?? 999;
      const ib = orderMap.get(b.metric) ?? 999;
      return ia - ib;
    });
  }, [kpis]);

  const passRate = kpis.find((k) => k.metric === 'PASS_RATE_7D');
  const coverage = kpis.find((k) => k.metric === 'COVERAGE_PCT');
  const flakyRate = kpis.find((k) => k.metric === 'FLAKY_RATE');
  const openDefects = kpis.find((k) => k.metric === 'ESCAPE_RATE');

  return (
    <div className="space-y-6">
      {/* Page header with export buttons */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-primary">
            {project?.name ?? 'Project Overview'}
          </h1>
          <p className="text-xs text-muted">
            Key metrics and recent activity
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportPdfButton projectId={projectId} />
        </div>
      </div>

      {/* KPI Cards — matches Cross-Project KPI Rollup design */}
      {displayKpis.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-1 gap-px bg-qod-border sm:grid-cols-2 lg:grid-cols-3">
            {displayKpis.slice(0, 9).map((kpi) => {
              const Icon = OVERVIEW_ICONS[kpi.metric] ?? BarChart3;
              return (
                <div
                  key={kpi.metric}
                  className={cn(
                    'flex items-center gap-3 border-l-2 bg-qod-surface px-4 py-3',
                    kpi.hasData === false ? 'border-qod-border' : ragBorderColor(kpi.ragStatus),
                    kpiFetching && 'animate-pulse',
                  )}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-qod-bg">
                    <Icon className="h-4 w-4 text-secondary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted">
                      {OVERVIEW_LABELS[kpi.metric] ?? kpi.metric.replace(/_/g, ' ')}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-lg font-semibold text-primary">
                        {kpi.hasData === false ? 'N/A' : formatOverviewKPI(kpi.metric, kpi.latestValue)}
                      </span>
                      <span className="text-xs text-muted">—</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card p-8 text-center">
          <BarChart3 className="mx-auto h-8 w-8 text-muted" />
          <p className="mt-2 text-sm text-muted">No KPI data yet. Connect a data source to start tracking metrics.</p>
        </div>
      )}

      {/* Recent Runs */}
      <div className="card">
        <div className="border-b border-qod-border px-5 py-3">
          <h2 className="text-sm font-semibold text-primary">Recent Runs</h2>
        </div>
        {runsLoading ? (
          <div className="divide-y divide-qod-border">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="px-5 py-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 shrink-0 rounded-lg bg-slate-200 dark:bg-slate-700" />
                  <div className="flex-1 space-y-2.5">
                    <div className="h-3.5 rounded bg-slate-200 dark:bg-slate-700" style={{ width: `${55 - i * 8}%` }} />
                    <div className="flex gap-3">
                      <div className="h-3 w-20 rounded bg-slate-100 dark:bg-slate-800" />
                      <div className="h-3 w-14 rounded bg-slate-100 dark:bg-slate-800" />
                      <div className="h-3 w-16 rounded bg-slate-100 dark:bg-slate-800" />
                    </div>
                  </div>
                  <div className="h-5 w-16 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700" />
                </div>
              </div>
            ))}
          </div>
        ) : recentRuns.length > 0 ? (
          <div className="divide-y divide-qod-border">
            {recentRuns.map((run) => {
              const status = run.status as string;
              const isPassed = status === 'PASSED';
              const isFailed = status === 'FAILED';
              const isRunning = status === 'RUNNING' || status === 'QUEUED';
              const passRate = run.totalTests > 0
                ? Math.round((run.passedCount / run.totalTests) * 100)
                : 0;
              return (
                <div key={run.id} className="px-5 py-4">
                  {/* Row 1: Status icon + name + time ago */}
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                      isPassed ? 'bg-rag-green/10' : isRunning ? 'bg-qod-accent/10' : 'bg-rag-red/10',
                    )}>
                      {isPassed
                        ? <CheckCircle2 className="h-4 w-4 text-rag-green" />
                        : isRunning
                          ? <Activity className="h-4 w-4 text-qod-accent animate-pulse" />
                          : <XCircle className="h-4 w-4 text-rag-red" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-primary truncate block">
                        {run.name ?? `Run ${run.id.slice(0, 8)}`}
                      </span>
                    </div>
                    <span className={cn(
                      'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                      isPassed ? 'bg-rag-green/10 text-rag-green'
                        : isRunning ? 'bg-qod-accent/10 text-qod-accent'
                        : 'bg-rag-red/10 text-rag-red',
                    )}>
                      {run.status}
                    </span>
                  </div>

                  {/* Row 2: Metadata chips */}
                  <div className="mt-2 ml-11 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                    {run.branch && (
                      <span className="inline-flex items-center gap-1">
                        <GitBranch className="h-3 w-3" />
                        {run.branch}
                      </span>
                    )}
                    {run.sha && (
                      <span className="font-mono">{run.sha.slice(0, 7)}</span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Timer className="h-3 w-3" />
                      {formatDuration(run.durationMs)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(run.startedAt)}
                    </span>
                    {run.environment && (
                      <span className="rounded bg-qod-bg px-1.5 py-0.5 text-[10px] font-medium uppercase">
                        {run.environment}
                      </span>
                    )}
                  </div>

                  {/* Row 3: Stats */}
                  <div className="mt-2 ml-11 flex items-center gap-3 text-xs">
                    <span className="font-medium text-secondary">{run.totalTests} tests</span>
                    <span className="text-rag-green">{run.passedCount} passed</span>
                    {run.failedCount > 0 && (
                      <span className="text-rag-red">{run.failedCount} failed</span>
                    )}
                    {run.skippedCount > 0 && (
                      <span className="text-muted">{run.skippedCount} skipped</span>
                    )}
                    {run.flakyCount > 0 && (
                      <span className="text-rag-amber">{run.flakyCount} flaky</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-8 text-center text-sm text-muted">
            No test runs yet. Upload a JUnit/TestNG XML report or connect a CI system.
          </div>
        )}
      </div>
    </div>
  );
}
