// ─── Client-side demo data provider ───────────────────────────────────
// Wraps the shared generator so the frontend can run entirely without
// a backend connection.  Every helper is synchronous and caches its
// generated data per project so repeated calls are cheap.

import {
  generateDemoData,
  DEFAULT_DEMO_CONFIG,
  type DemoConfig,
  type DemoDataSet,
  type DemoTestCase,
  type DemoTestRun,
  type DemoDefect,
  type DemoStory,
  type DemoKPISnapshot,
} from '@qod/shared';

// ── Demo project definitions ──────────────────────────────────────────

export interface DemoProject {
  id: string;
  name: string;
  slug?: string;
  description: string | null;
  demoMode: boolean;
}

const DEMO_PROJECTS: DemoProject[] = [
  {
    id: 'demo-ecommerce',
    name: 'E-Commerce Platform',
    description: 'Online storefront with payments, inventory, and order management',
  },
  {
    id: 'demo-banking',
    name: 'Mobile Banking App',
    description: 'Consumer banking app with accounts, transfers, and lending',
  },
  {
    id: 'demo-internal',
    name: 'Internal Tools',
    description: 'Back-office dashboards, admin panels, and developer utilities',
  },
].map((p) => ({ ...p, demoMode: true }));

// Each project uses distinct config values so they feel different.
const PROJECT_CONFIGS: Record<string, Partial<DemoConfig>> = {
  'demo-ecommerce': {
    projectName: 'E-Commerce Platform',
    seed: 42,
    testCaseCount: 420,
    defectCount: 95,
    passRateMean: 0.88,
    flakyTestPct: 0.07,
    avgRunsPerDay: 5,
    featureAreas: [
      'Authentication', 'Payments', 'Cart', 'Inventory',
      'Search', 'Recommendations', 'Checkout', 'User Profile',
      'Notifications', 'Shipping',
    ],
  },
  'demo-banking': {
    projectName: 'Mobile Banking App',
    seed: 137,
    testCaseCount: 310,
    defectCount: 72,
    passRateMean: 0.92,
    flakyTestPct: 0.05,
    avgRunsPerDay: 3,
    featureAreas: [
      'Authentication', 'Accounts', 'Transfers', 'Bill Pay',
      'Lending', 'Cards', 'Notifications', 'Settings',
      'Security', 'Onboarding',
    ],
  },
  'demo-internal': {
    projectName: 'Internal Tools',
    seed: 256,
    testCaseCount: 180,
    defectCount: 48,
    passRateMean: 0.82,
    flakyTestPct: 0.12,
    avgRunsPerDay: 2,
    featureAreas: [
      'Admin Panel', 'User Management', 'Reporting',
      'API Gateway', 'Monitoring', 'Developer Portal',
      'CI Dashboard', 'Config Management',
    ],
  },
};

// ── Caching ───────────────────────────────────────────────────────────

const dataCache = new Map<string, DemoDataSet>();

function projectIndexSeed(projectId: string): number {
  const idx = DEMO_PROJECTS.findIndex((p) => p.id === projectId);
  return idx >= 0 ? idx : 0;
}

// ── Public API ────────────────────────────────────────────────────────

export function getDemoProjects(): DemoProject[] {
  return DEMO_PROJECTS;
}

export function getDemoDataForProject(projectId: string): DemoDataSet {
  const cached = dataCache.get(projectId);
  if (cached) return cached;

  const overrides = PROJECT_CONFIGS[projectId] ?? {};
  const config: DemoConfig = {
    ...DEFAULT_DEMO_CONFIG,
    ...overrides,
    seed: overrides.seed ?? (42 + projectIndexSeed(projectId) * 100),
  };

  const data = generateDemoData(config);
  dataCache.set(projectId, data);
  return data;
}

// ── KPI Dashboard ─────────────────────────────────────────────────────

export interface KPICard {
  metric: string;
  latestValue: number;
  hasData?: boolean;
  target: number;
  ragStatus: 'RED' | 'AMBER' | 'GREEN' | 'NONE';
  sparkline: number[];
  trend: 'UP' | 'DOWN' | 'FLAT';
}

function computeRag(metric: string, value: number, target: number): 'RED' | 'AMBER' | 'GREEN' {
  // For metrics where lower is better (FLAKY_RATE, MTTD, MTTR, ESCAPE_RATE)
  const lowerIsBetter = ['FLAKY_RATE', 'MTTD_HOURS', 'MTTR_HOURS', 'ESCAPE_RATE'].includes(metric);

  if (lowerIsBetter) {
    if (value <= target) return 'GREEN';
    if (value <= target * 1.5) return 'AMBER';
    return 'RED';
  }

  // Higher is better
  if (value >= target) return 'GREEN';
  if (value >= target * 0.8) return 'AMBER';
  return 'RED';
}

function computeTrend(sparkline: number[]): 'UP' | 'DOWN' | 'FLAT' {
  if (sparkline.length < 2) return 'FLAT';
  const recent = sparkline.slice(-7);
  const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
  const secondHalf = recent.slice(Math.floor(recent.length / 2));
  const avg1 = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avg2 = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  const diff = avg2 - avg1;
  if (Math.abs(diff) < avg1 * 0.02) return 'FLAT';
  return diff > 0 ? 'UP' : 'DOWN';
}

// Metrics excluded from the KPI dashboard (filtered out by the Overview page)
const EXCLUDED_METRICS = new Set(['EXEC_VELOCITY', 'MTTD_HOURS']);

// Desired display order for KPI cards (must match real API order as consumed by the Overview page)
const KPI_DISPLAY_ORDER = [
  'COVERAGE_PCT',
  'PASS_RATE_30D',
  'FLAKY_RATE',
  'MTTR_HOURS',
  'ESCAPE_RATE',
  'REQ_COVERAGE',
  'READINESS_SCORE',
  'PASS_RATE_7D',
];

export function getDemoKPIDashboard(projectId: string): KPICard[] {
  const { kpiSnapshots } = getDemoDataForProject(projectId);

  // Group by metric
  const byMetric = new Map<string, DemoKPISnapshot[]>();
  for (const snap of kpiSnapshots) {
    if (EXCLUDED_METRICS.has(snap.metric)) continue;
    const list = byMetric.get(snap.metric) ?? [];
    list.push(snap);
    byMetric.set(snap.metric, list);
  }

  const cardsByMetric = new Map<string, KPICard>();
  for (const [metric, snapshots] of byMetric) {
    const sorted = [...snapshots].sort(
      (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
    );
    const latest = sorted[sorted.length - 1];
    const sparkline = sorted.slice(-30).map((s) => s.value);

    cardsByMetric.set(metric, {
      metric,
      latestValue: latest.value,
      hasData: true,
      target: latest.target,
      ragStatus: computeRag(metric, latest.value, latest.target),
      sparkline,
      trend: computeTrend(sparkline),
    });
  }

  // Return cards in the defined display order
  const cards: KPICard[] = [];
  for (const metric of KPI_DISPLAY_ORDER) {
    const card = cardsByMetric.get(metric);
    if (card) cards.push(card);
  }
  // Append any remaining metrics not in the display order
  for (const [metric, card] of cardsByMetric) {
    if (!KPI_DISPLAY_ORDER.includes(metric)) cards.push(card);
  }

  return cards;
}

// ── Test Cases with filtering / pagination ────────────────────────────

export interface TestCaseFilters {
  featureAreaId?: string;
  type?: DemoTestCase['type'];
  automationStatus?: DemoTestCase['automationStatus'];
  suiteName?: string;
  testRailType?: string;
  hasReferences?: boolean;
  referenceSearch?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function getDemoTestCases(
  projectId: string,
  filters?: TestCaseFilters,
): PaginatedResult<DemoTestCase> {
  const { testCases } = getDemoDataForProject(projectId);
  let filtered = [...testCases];

  if (filters?.featureAreaId) {
    filtered = filtered.filter((tc) => tc.featureAreaId === filters.featureAreaId);
  }
  if (filters?.type) {
    filtered = filtered.filter((tc) => tc.type === filters.type);
  }
  if (filters?.automationStatus) {
    filtered = filtered.filter((tc) => tc.automationStatus === filters.automationStatus);
  }
  if (filters?.suiteName) {
    filtered = filtered.filter((tc) => tc.suiteName === filters.suiteName);
  }
  if (filters?.testRailType) {
    filtered = filtered.filter((tc) => tc.testRailType === filters.testRailType);
  }
  if (filters?.hasReferences === true) {
    filtered = filtered.filter((tc) => tc.references);
  }
  if (filters?.hasReferences === false) {
    filtered = filtered.filter((tc) => !tc.references);
  }
  if (filters?.referenceSearch) {
    const q = filters.referenceSearch.toLowerCase();
    filtered = filtered.filter((tc) => tc.references?.toLowerCase().includes(q));
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    const qNoPrefix = q.startsWith('c') ? q.slice(1) : q;
    filtered = filtered.filter(
      (tc) =>
        tc.title.toLowerCase().includes(q) ||
        tc.externalId.toLowerCase().includes(q) ||
        tc.externalId.toLowerCase().includes(qNoPrefix) ||
        tc.tags.some((t) => t.includes(q)),
    );
  }

  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 25;
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return { items, total, page, pageSize, totalPages };
}

// ── Test Runs with filtering / pagination ─────────────────────────────

export interface TestRunFilters {
  status?: DemoTestRun['status'];
  branch?: string;
  environment?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export function getDemoTestRuns(
  projectId: string,
  filters?: TestRunFilters,
): PaginatedResult<DemoTestRun> {
  const { testRuns } = getDemoDataForProject(projectId);
  let filtered = [...testRuns].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );

  if (filters?.status) {
    filtered = filtered.filter((r) => r.status === filters.status);
  }
  if (filters?.branch) {
    filtered = filtered.filter((r) => r.branch === filters.branch);
  }
  if (filters?.environment) {
    filtered = filtered.filter((r) => r.environment === filters.environment);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.branch.toLowerCase().includes(q) ||
        r.sha.toLowerCase().includes(q),
    );
  }

  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 20;
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return { items, total, page, pageSize, totalPages };
}

// ── Defects with filtering / pagination ───────────────────────────────

export interface DefectFilters {
  severity?: DemoDefect['severity'];
  status?: DemoDefect['status'];
  featureAreaId?: string;
  label?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export function getDemoDefects(
  projectId: string,
  filters?: DefectFilters,
): PaginatedResult<DemoDefect> {
  const { defects } = getDemoDataForProject(projectId);
  let filtered = [...defects].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  if (filters?.severity) {
    filtered = filtered.filter((d) => d.severity === filters.severity);
  }
  if (filters?.status) {
    filtered = filtered.filter((d) => d.status === filters.status);
  }
  if (filters?.featureAreaId) {
    filtered = filtered.filter((d) => d.featureAreaId === filters.featureAreaId);
  }
  if (filters?.label) {
    filtered = filtered.filter((d) => d.labels.includes(filters.label!));
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.externalId.toLowerCase().includes(q) ||
        d.component.toLowerCase().includes(q),
    );
  }

  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 20;
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return { items, total, page, pageSize, totalPages };
}

// ── Stories ───────────────────────────────────────────────────────────

export interface StoryFilters {
  status?: DemoStory['status'];
  component?: string;
  label?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export function getDemoStories(
  projectId: string,
  filters?: StoryFilters,
): PaginatedResult<DemoStory> {
  const { stories } = getDemoDataForProject(projectId);
  let filtered = [...stories].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  if (filters?.status) {
    filtered = filtered.filter((s) => s.status === filters.status);
  }
  if (filters?.component) {
    filtered = filtered.filter((s) => s.component === filters.component);
  }
  if (filters?.label) {
    filtered = filtered.filter((s) => s.labels.includes(filters.label!));
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.externalId.toLowerCase().includes(q) ||
        s.component.toLowerCase().includes(q),
    );
  }

  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 20;
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return { items, total, page, pageSize, totalPages };
}

// ── Pipeline Runs ─────────────────────────────────────────────────────

export function getDemoPipelineRuns(projectId: string) {
  const { pipelineRuns } = getDemoDataForProject(projectId);
  return [...pipelineRuns].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
}

// ── Pass Rate Trend ───────────────────────────────────────────────────

export interface DailyPassRate {
  date: string; // ISO date string (YYYY-MM-DD)
  passRate: number;
  totalTests: number;
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
}

export function getDemoPassRateTrend(
  projectId: string,
  days: number = 30,
): DailyPassRate[] {
  const { testRuns } = getDemoDataForProject(projectId);
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 86400000);

  // Group runs by date
  const byDate = new Map<string, DemoTestRun[]>();
  for (const run of testRuns) {
    const runDate = new Date(run.startedAt);
    if (runDate < cutoff) continue;
    const key = runDate.toISOString().slice(0, 10);
    const list = byDate.get(key) ?? [];
    list.push(run);
    byDate.set(key, list);
  }

  // Build sorted daily aggregates
  const result: DailyPassRate[] = [];
  for (let d = days; d >= 0; d--) {
    const date = new Date(now.getTime() - d * 86400000).toISOString().slice(0, 10);
    const runs = byDate.get(date) ?? [];
    if (runs.length === 0) continue;

    const passedRuns = runs.filter((r) => r.status === 'PASSED').length;
    const failedRuns = runs.filter((r) => r.status === 'FAILED').length;
    const totalRuns = runs.length;
    const totalTests = runs.reduce((s, r) => s + r.totalTests, 0);
    const totalPassed = runs.reduce((s, r) => s + r.passedCount, 0);
    const passRate =
      totalTests > 0 ? Math.round((totalPassed / totalTests) * 10000) / 100 : 0;

    result.push({ date, passRate, totalTests, totalRuns, passedRuns, failedRuns });
  }

  return result;
}

// ── Coverage Data ─────────────────────────────────────────────────────

export interface FeatureCoverage {
  featureAreaId: string;
  featureAreaName: string;
  totalTestCases: number;
  automatedCount: number;
  manualCount: number;
  needsUpdateCount: number;
  automationPct: number;
}

export function getDemoCoverageData(projectId: string): FeatureCoverage[] {
  const { featureAreas, testCases } = getDemoDataForProject(projectId);

  return featureAreas.map((fa) => {
    const cases = testCases.filter((tc) => tc.featureAreaId === fa.id);
    const automated = cases.filter((tc) => tc.automationStatus === 'AUTOMATED').length;
    const manual = cases.filter((tc) => tc.automationStatus === 'NOT_AUTOMATED').length;
    const needsUpdate = cases.filter((tc) => tc.automationStatus === 'NEEDS_UPDATE').length;
    const total = cases.length;

    return {
      featureAreaId: fa.id,
      featureAreaName: fa.name,
      totalTestCases: total,
      automatedCount: automated,
      manualCount: manual,
      needsUpdateCount: needsUpdate,
      automationPct: total > 0 ? Math.round((automated / total) * 10000) / 100 : 0,
    };
  });
}

// ── Defect Trend (weekly opened vs closed) ────────────────────────────

export interface DailyDefectTrend {
  date: string; // ISO date (yyyy-MM-dd)
  opened: number;
  closed: number;
}

export function getDemoDefectTrend(projectId: string): DailyDefectTrend[] {
  const { defects } = getDemoDataForProject(projectId);

  const now = new Date();
  const since = new Date(now.getTime() - 90 * 86400000);

  const byDay = new Map<string, { opened: number; closed: number }>();
  for (const d of defects) {
    const created = new Date(d.createdAt);
    if (created >= since) {
      const key = created.toISOString().slice(0, 10);
      const entry = byDay.get(key) ?? { opened: 0, closed: 0 };
      entry.opened++;
      byDay.set(key, entry);
    }
    if (d.closedAt) {
      const closed = new Date(d.closedAt);
      if (closed >= since) {
        const key = closed.toISOString().slice(0, 10);
        const entry = byDay.get(key) ?? { opened: 0, closed: 0 };
        entry.closed++;
        byDay.set(key, entry);
      }
    }
  }

  // Fill in missing days
  const result: DailyDefectTrend[] = [];
  const cursor = new Date(since);
  while (cursor <= now) {
    const key = cursor.toISOString().slice(0, 10);
    const entry = byDay.get(key);
    result.push({ date: key, opened: entry?.opened ?? 0, closed: entry?.closed ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

// ── Flaky Tests ───────────────────────────────────────────────────────

export interface FlakyTest {
  testCaseId: string;
  testTitle: string;
  featureAreaId: string;
  flakyCount: number;
  totalExecutions: number;
  flakyRate: number;
  lastFlakyAt: Date;
}

export function getDemoFlakyTests(projectId: string): FlakyTest[] {
  const { testCases, testRuns } = getDemoDataForProject(projectId);
  const testMap = new Map(testCases.map((tc) => [tc.id, tc]));

  // Aggregate per test case across all runs
  const stats = new Map<
    string,
    { flakyCount: number; totalExecutions: number; lastFlakyAt: Date }
  >();

  for (const run of testRuns) {
    for (const result of run.results) {
      const existing = stats.get(result.testCaseId) ?? {
        flakyCount: 0,
        totalExecutions: 0,
        lastFlakyAt: new Date(0),
      };
      existing.totalExecutions++;
      if (result.status === 'FLAKY') {
        existing.flakyCount++;
        if (new Date(run.startedAt) > existing.lastFlakyAt) {
          existing.lastFlakyAt = new Date(run.startedAt);
        }
      }
      stats.set(result.testCaseId, existing);
    }
  }

  const flakyTests: FlakyTest[] = [];
  for (const [testCaseId, s] of stats) {
    if (s.flakyCount === 0) continue;
    const tc = testMap.get(testCaseId);
    if (!tc) continue;

    flakyTests.push({
      testCaseId,
      testTitle: tc.title,
      featureAreaId: tc.featureAreaId,
      flakyCount: s.flakyCount,
      totalExecutions: s.totalExecutions,
      flakyRate: Math.round((s.flakyCount / s.totalExecutions) * 10000) / 100,
      lastFlakyAt: s.lastFlakyAt,
    });
  }

  // Sort by flaky rate descending
  return flakyTests.sort((a, b) => b.flakyRate - a.flakyRate);
}

// ── Severity Breakdown ────────────────────────────────────────────────

export interface SeverityBreakdown {
  severity: DemoDefect['severity'];
  count: number;
}

export function getDemoSeverityBreakdown(projectId: string): SeverityBreakdown[] {
  const { defects } = getDemoDataForProject(projectId);
  const severities: DemoDefect['severity'][] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

  return severities.map((severity) => {
    const matching = defects.filter((d) => d.severity === severity);
    return {
      severity,
      count: matching.length,
    };
  });
}

// ── Test Execution History ────────────────────────────────────────────

export interface TestExecutionEntry {
  runId: string;
  runName: string;
  date: Date;
  status: 'PASSED' | 'FAILED' | 'SKIPPED' | 'FLAKY';
  durationMs: number;
  errorMessage?: string;
  branch: string;
  environment: string;
}

export function getTestExecutionHistory(
  projectId: string,
  testCaseId: string,
): TestExecutionEntry[] {
  const { testRuns } = getDemoDataForProject(projectId);

  const entries: TestExecutionEntry[] = [];
  for (const run of testRuns) {
    for (const result of run.results) {
      if (result.testCaseId !== testCaseId) continue;
      entries.push({
        runId: run.id,
        runName: run.name,
        date: new Date(run.startedAt),
        status: result.status,
        durationMs: result.durationMs,
        ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
        branch: run.branch,
        environment: run.environment,
      });
    }
  }

  // Sort by date ascending
  return entries.sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
}

// ── Re-run Tracking Statistics ────────────────────────────────────────

export interface RerunStats {
  totalRuns: number;
  rerunCount: number;
  rerunRate: number; // percentage
  originalFailRate: number; // failure rate of first runs only
  maskedFailRate: number; // failure rate after re-runs mask failures
  rerunsByDay: Array<{ date: string; original: number; reruns: number; passed?: number; failed?: number }>;
}

export function getRerunStats(projectId: string): RerunStats {
  const { testRuns } = getDemoDataForProject(projectId);

  const originalRuns = testRuns.filter((r) => !r.isRerun);
  const reruns = testRuns.filter((r) => r.isRerun);
  const rerunCount = reruns.length;
  const totalRuns = testRuns.length;
  const rerunRate = totalRuns > 0
    ? Math.round((rerunCount / totalRuns) * 10000) / 100
    : 0;

  // Original fail rate: failures among first runs only
  const originalFailedCount = originalRuns.filter((r) => r.status === 'FAILED').length;
  const originalFailRate = originalRuns.length > 0
    ? Math.round((originalFailedCount / originalRuns.length) * 10000) / 100
    : 0;

  // Masked fail rate: a failure is "masked" if the re-run passed.
  // For each original failed run, check if it has a passing re-run.
  const rerunByOriginalId = new Map<string, DemoTestRun>();
  for (const r of reruns) {
    if (r.originalRunId) {
      rerunByOriginalId.set(r.originalRunId, r);
    }
  }
  let maskedFailures = 0;
  for (const run of originalRuns) {
    if (run.status === 'FAILED') {
      const rerun = rerunByOriginalId.get(run.id);
      // Count as failed if there's no re-run, or the re-run also failed
      if (!rerun || rerun.status === 'FAILED') {
        maskedFailures++;
      }
    }
  }
  const maskedFailRate = originalRuns.length > 0
    ? Math.round((maskedFailures / originalRuns.length) * 10000) / 100
    : 0;

  // Group by day
  const dayMap = new Map<string, { original: number; reruns: number; passed: number; failed: number }>();
  for (const run of testRuns) {
    const dateKey = new Date(run.startedAt).toISOString().slice(0, 10);
    const entry = dayMap.get(dateKey) ?? { original: 0, reruns: 0, passed: 0, failed: 0 };
    if (run.isRerun) {
      entry.reruns++;
    } else {
      entry.original++;
    }
    if (run.status === 'PASSED') entry.passed++;
    else if (run.status === 'FAILED') entry.failed++;
    dayMap.set(dateKey, entry);
  }

  const rerunsByDay = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));

  return {
    totalRuns,
    rerunCount,
    rerunRate,
    originalFailRate,
    maskedFailRate,
    rerunsByDay,
  };
}

// ── Defect MTTD / MTTR Statistics ─────────────────────────────────────

export interface DefectTimingStats {
  avgMTTDHours: number; // mean time from creation to first detection (first status change)
  avgMTTRHours: number; // mean time from creation to resolution
  medianMTTRHours: number;
  mttrBySeverity: Array<{ severity: string; avgHours: number; count: number }>;
  mttrTrend: Array<{ week: string; avgHours: number }>; // weekly MTTR trend
  openBurndown?: Array<{ week: string; open: number }>; // weekly open defect count
}

export function getDefectMTTDMTTR(projectId: string): DefectTimingStats {
  const { defects } = getDemoDataForProject(projectId);

  const mttdValues: number[] = [];
  const mttrValues: number[] = [];

  // For MTTR by severity
  const severityBuckets = new Map<string, number[]>();

  // For MTTR weekly trend (keyed by resolved week)
  const weeklyBuckets = new Map<string, number[]>();

  for (const defect of defects) {
    // MTTD: time from creation to first changelog entry (first detection / status change)
    if (defect.changelog.length > 0) {
      const firstChange = defect.changelog[0];
      const mttdMs = new Date(firstChange.at).getTime() - new Date(defect.createdAt).getTime();
      if (mttdMs > 0) {
        mttdValues.push(mttdMs / 3600000); // convert to hours
      }
    }

    // MTTR: time from creation to resolution
    if (defect.resolvedAt) {
      const mttrMs = new Date(defect.resolvedAt).getTime() - new Date(defect.createdAt).getTime();
      if (mttrMs > 0) {
        const mttrHours = mttrMs / 3600000;
        mttrValues.push(mttrHours);

        // By severity
        const bucket = severityBuckets.get(defect.severity) ?? [];
        bucket.push(mttrHours);
        severityBuckets.set(defect.severity, bucket);

        // By week of resolution
        const resolvedDate = new Date(defect.resolvedAt);
        const dayOfWeek = resolvedDate.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const weekStart = new Date(resolvedDate.getTime() + mondayOffset * 86400000);
        const weekKey = weekStart.toISOString().slice(0, 10);
        const weekBucket = weeklyBuckets.get(weekKey) ?? [];
        weekBucket.push(mttrHours);
        weeklyBuckets.set(weekKey, weekBucket);
      }
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100 : 0;

  const median = (arr: number[]) => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const val = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
    return Math.round(val * 100) / 100;
  };

  const mttrBySeverity = (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((severity) => {
    const values = severityBuckets.get(severity) ?? [];
    return {
      severity,
      avgHours: avg(values),
      count: values.length,
    };
  });

  const mttrTrend = [...weeklyBuckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, values]) => ({
      week,
      avgHours: avg(values),
    }));

  // Compute open burndown: 12 weekly data points showing open defect count at each week boundary
  const openBurndown = computeOpenBurndown(defects);

  return {
    avgMTTDHours: avg(mttdValues),
    avgMTTRHours: avg(mttrValues),
    medianMTTRHours: median(mttrValues),
    mttrBySeverity,
    mttrTrend,
    openBurndown,
  };
}

function computeOpenBurndown(
  defects: DemoDefect[],
): Array<{ week: string; open: number }> {
  if (defects.length === 0) return [];

  const now = new Date();
  const twelveWeeksAgo = new Date(now);
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

  // Generate weekly checkpoints (Mondays)
  const weeks: Date[] = [];
  const cursor = new Date(twelveWeeksAgo);
  const day = cursor.getDay();
  cursor.setDate(cursor.getDate() - ((day + 6) % 7)); // snap to Monday
  while (cursor <= now) {
    weeks.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }

  // For each week checkpoint, count how many defects were open at that point
  const openStatuses = new Set(['OPEN', 'IN_PROGRESS', 'REOPENED']);
  return weeks.map((weekStart) => {
    const endOfWeek = new Date(weekStart);
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    let openCount = 0;
    for (const d of defects) {
      const created = new Date(d.createdAt);
      if (created > endOfWeek) continue; // not yet created
      const closed = d.resolvedAt ?? d.closedAt;
      if (closed && new Date(closed) <= endOfWeek) continue; // already resolved
      // If no resolution date but status is resolved/closed (e.g. Jira "Won't Do"),
      // treat as not open
      if (!closed && !openStatuses.has(d.status)) continue;
      openCount++;
    }
    return { week: weekStart.toISOString().slice(0, 10), open: openCount };
  });
}
