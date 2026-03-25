// ─── Demo data generator — produces realistic artificial data ─────────
// Used when a project has demoMode=true or no connectors configured.
// All IDs are deterministic (seeded) so demo data is stable across reloads.

export interface DemoConfig {
  projectName: string;
  seed?: number;
  daysOfHistory: number;   // how many days back to generate
  testCaseCount: number;
  featureAreas: string[];
  avgRunsPerDay: number;
  defectCount: number;
  flakyTestPct: number;    // 0-1
  passRateMean: number;    // 0-1, e.g. 0.88
}

export const DEFAULT_DEMO_CONFIG: DemoConfig = {
  projectName: 'Demo Project',
  seed: 42,
  daysOfHistory: 90,
  testCaseCount: 350,
  featureAreas: [
    'Authentication', 'Payments', 'Dashboard', 'User Management',
    'Notifications', 'Search', 'Reporting', 'API Gateway',
    'Onboarding', 'Settings',
  ],
  avgRunsPerDay: 4,
  defectCount: 85,
  flakyTestPct: 0.08,
  passRateMean: 0.87,
};

// Seeded PRNG (mulberry32)
function createRng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function pickWeighted<T>(rng: () => number, items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function uuid(rng: () => number): string {
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += '-';
    else if (i === 14) s += '4';
    else if (i === 19) s += hex[(Math.floor(rng() * 4) + 8)];
    else s += hex[Math.floor(rng() * 16)];
  }
  return s;
}

export interface DemoDataSet {
  featureAreas: DemoFeatureArea[];
  testCases: DemoTestCase[];
  testRuns: DemoTestRun[];
  defects: DemoDefect[];
  stories: DemoStory[];
  pipelineRuns: DemoPipelineRun[];
  kpiSnapshots: DemoKPISnapshot[];
}

export interface DemoFeatureArea {
  id: string;
  name: string;
  color: string;
}

export interface DemoTestCase {
  id: string;
  externalId: string;
  title: string;
  type: 'MANUAL' | 'AUTOMATED' | 'BDD';
  automationStatus: 'AUTOMATED' | 'NOT_AUTOMATED' | 'NEEDS_UPDATE';
  featureAreaId: string;
  tags: string[];
  suiteName: string;
  lastExecutedAt: Date | null;
  references?: string;
  testRailType?: string;
}

export interface DemoTestRun {
  id: string;
  name: string;
  triggerType: 'CI_PUSH' | 'PR' | 'SCHEDULE' | 'MANUAL';
  branch: string;
  sha: string;
  environment: string;
  startedAt: Date;
  durationMs: number;
  status: 'PASSED' | 'FAILED';
  totalTests: number;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  flakyCount: number;
  erroredCount: number;
  results: DemoTestResult[];
  pipelineRunId: string;
  isRerun: boolean;
  originalRunId: string | null;
}

export interface DemoTestResult {
  id: string;
  testCaseId: string;
  status: 'PASSED' | 'FAILED' | 'SKIPPED' | 'FLAKY';
  durationMs: number;
  errorMessage?: string;
}

export interface DemoDefectChangelogEntry {
  from: string;
  to: string;
  at: Date;
}

export interface DemoDefect {
  id: string;
  externalId: string;
  url: string | null;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'REOPENED';
  component: string;
  featureAreaId: string;
  labels: string[];
  isEscaped: boolean;
  reopenCount: number;
  createdAt: Date;
  resolvedAt: Date | null;
  closedAt: Date | null;
  changelog: DemoDefectChangelogEntry[];
}

export interface DemoStory {
  id: string;
  externalId: string;
  title: string;
  url: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'REOPENED';
  storyPoints: number | null;
  assignee: string;
  component: string;
  labels: string[];
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface DemoPipelineRun {
  id: string;
  workflowName: string;
  branch: string;
  sha: string;
  status: 'QUEUED' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE' | 'CANCELLED';
  durationMs: number;
  triggeredBy: string;
  startedAt: Date;
}

export interface DemoKPISnapshot {
  id: string;
  metric: string;
  value: number;
  target: number;
  recordedAt: Date;
}

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#84cc16'];
const ENVIRONMENTS = ['staging', 'production', 'dev', 'qa'];
const BRANCHES = ['main', 'develop', 'feature/auth-v2', 'feature/payments', 'fix/search-perf', 'release/2.4'];
const WORKFLOWS = ['CI Pipeline', 'E2E Tests', 'Unit Tests', 'Integration Tests'];
const ACTORS = ['alice', 'bob', 'carol', 'dave', 'eve'];
const SEVERITIES: Array<'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'> = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const PRIORITIES: Array<'P0' | 'P1' | 'P2' | 'P3'> = ['P0', 'P1', 'P2', 'P3'];
const DEFECT_STATUSES: Array<'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'REOPENED'> = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED'];
const STORY_STATUSES: Array<'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'REOPENED'> = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED'];
const STORY_LABELS = ['mvp', 'tech-debt', 'ux', 'performance', 'security', 'api', 'mobile', 'accessibility'];
const STORY_POINTS = [1, 2, 3, 5, 8, 13];

const STORY_TEMPLATES = [
  'Add two-factor authentication support',
  'Implement dark mode toggle',
  'Create API rate limiting dashboard',
  'Build user onboarding wizard',
  'Add CSV export for reports',
  'Implement real-time notifications',
  'Create admin audit log view',
  'Add bulk import from CSV',
  'Build search autocomplete',
  'Implement SSO with SAML',
  'Add role-based access control',
  'Create custom dashboard widgets',
  'Implement webhook management UI',
  'Add pagination to all list views',
  'Build settings backup/restore',
];

const BUG_TEMPLATES = [
  'Login fails with special characters in password',
  'Payment processing timeout on high load',
  'Dashboard charts not rendering on Safari',
  'Search results missing for quoted terms',
  'Email notifications delayed by 30+ minutes',
  'User avatar upload fails for PNG > 5MB',
  'API rate limiter triggers too aggressively',
  'Export CSV generates corrupted UTF-8',
  'Mobile nav menu overlaps content',
  'Password reset link expires too quickly',
  'Pagination breaks with filter applied',
  'Dark mode colors inconsistent on settings page',
  'Webhook retry logic drops events',
  'Session timeout not respecting remember-me',
  'Sorting by date column reverses order',
];

const TEST_TEMPLATES = [
  'should authenticate user with valid credentials',
  'should reject expired tokens',
  'should process payment successfully',
  'should handle payment gateway timeout',
  'should render dashboard metrics',
  'should export report as PDF',
  'should send notification on threshold breach',
  'should paginate search results',
  'should validate required fields',
  'should handle concurrent updates',
  'should return 404 for missing resource',
  'should apply role-based access control',
  'should sync data incrementally',
  'should handle webhook signature verification',
  'should cache response for repeated queries',
];

export function generateDemoData(config: DemoConfig = DEFAULT_DEMO_CONFIG): DemoDataSet {
  const rng = createRng(config.seed ?? 42);
  const now = new Date();

  // Feature areas
  const featureAreas: DemoFeatureArea[] = config.featureAreas.map((name, i) => ({
    id: uuid(rng),
    name,
    color: COLORS[i % COLORS.length],
  }));

  // Test cases
  const testCases: DemoTestCase[] = [];
  const flakyTestIds = new Set<string>();
  for (let i = 0; i < config.testCaseCount; i++) {
    const id = uuid(rng);
    const fa = pick(rng, featureAreas);
    const isAutomated = rng() > 0.2;
    const isBdd = isAutomated && rng() > 0.8;
    const template = pick(rng, TEST_TEMPLATES);
    const tc: DemoTestCase = {
      id,
      externalId: `TC-${1000 + i}`,
      title: `[${fa.name}] ${template} #${i}`,
      type: isBdd ? 'BDD' : isAutomated ? 'AUTOMATED' : 'MANUAL',
      automationStatus: isAutomated ? 'AUTOMATED' : rng() > 0.5 ? 'NOT_AUTOMATED' : 'NEEDS_UPDATE',
      featureAreaId: fa.id,
      tags: [fa.name.toLowerCase().replace(/ /g, '-'), ...(rng() > 0.6 ? ['smoke'] : []), ...(rng() > 0.8 ? ['regression'] : [])],
      suiteName: fa.name,
      testRailType: rng() > 0.5 ? 'Regression' : rng() > 0.5 ? 'Smoke & Sanity' : 'Functional',
      references: rng() > 0.6 ? `PS-${Math.floor(1000 + rng() * 9000)}` : undefined,
      lastExecutedAt: isAutomated ? new Date(now.getTime() - rng() * 7 * 86400000) : null,
    };
    testCases.push(tc);
    if (rng() < config.flakyTestPct) flakyTestIds.add(id);
  }

  const automatedTests = testCases.filter(t => t.automationStatus === 'AUTOMATED');

  // Test runs + pipeline runs
  const testRuns: DemoTestRun[] = [];
  const pipelineRuns: DemoPipelineRun[] = [];

  for (let day = config.daysOfHistory; day >= 0; day--) {
    const runsToday = Math.max(1, Math.round(config.avgRunsPerDay + (rng() - 0.5) * 2));
    for (let r = 0; r < runsToday; r++) {
      const startedAt = new Date(now.getTime() - day * 86400000 + r * 3600000 + rng() * 3600000);
      const branch = pick(rng, BRANCHES);
      const sha = Array.from({ length: 7 }, () => Math.floor(rng() * 16).toString(16)).join('');
      const env = pick(rng, ENVIRONMENTS);
      const workflow = pick(rng, WORKFLOWS);
      const actor = pick(rng, ACTORS);

      const pipelineId = uuid(rng);
      const runId = uuid(rng);

      // Simulate pass rate trending upward over time
      const dayProgress = 1 - day / config.daysOfHistory;
      const adjustedPassRate = config.passRateMean + dayProgress * 0.05 + (rng() - 0.5) * 0.1;
      const clampedPassRate = Math.max(0.5, Math.min(0.99, adjustedPassRate));

      // Pick subset of automated tests for this run
      const runTestCount = Math.min(automatedTests.length, Math.floor(automatedTests.length * (0.6 + rng() * 0.4)));
      const shuffled = [...automatedTests].sort(() => rng() - 0.5);
      const runTests = shuffled.slice(0, runTestCount);

      const results: DemoTestResult[] = runTests.map(tc => {
        let status: 'PASSED' | 'FAILED' | 'SKIPPED' | 'FLAKY';
        if (rng() < 0.03) {
          status = 'SKIPPED';
        } else if (flakyTestIds.has(tc.id) && rng() < 0.4) {
          status = 'FLAKY';
        } else if (rng() > clampedPassRate) {
          status = 'FAILED';
        } else {
          status = 'PASSED';
        }

        return {
          id: uuid(rng),
          testCaseId: tc.id,
          status,
          durationMs: Math.floor(100 + rng() * 15000),
          ...(status === 'FAILED' || status === 'FLAKY'
            ? { errorMessage: `AssertionError: expected ${Math.floor(rng() * 100)} to equal ${Math.floor(rng() * 100)}` }
            : {}),
        };
      });

      const passed = results.filter(r => r.status === 'PASSED').length;
      const failed = results.filter(r => r.status === 'FAILED').length;
      const skipped = results.filter(r => r.status === 'SKIPPED').length;
      const flaky = results.filter(r => r.status === 'FLAKY').length;
      const totalDuration = results.reduce((s, r) => s + r.durationMs, 0);
      const runStatus = failed > 0 ? 'FAILED' : 'PASSED';

      const pipelineStatus: DemoPipelineRun['status'] =
        rng() < 0.02 ? 'CANCELLED' : runStatus === 'PASSED' ? 'SUCCESS' : 'FAILURE';

      pipelineRuns.push({
        id: pipelineId,
        workflowName: workflow,
        branch,
        sha,
        status: pipelineStatus,
        durationMs: totalDuration + Math.floor(rng() * 30000),
        triggeredBy: actor,
        startedAt,
      });

      const triggerType = pick(rng, ['CI_PUSH', 'PR', 'SCHEDULE', 'MANUAL'] as const);
      const runName = `${workflow} #${testRuns.length + 1}`;

      testRuns.push({
        id: runId,
        name: runName,
        triggerType,
        branch,
        sha,
        environment: env,
        startedAt,
        durationMs: totalDuration,
        status: runStatus,
        totalTests: results.length,
        passedCount: passed,
        failedCount: failed,
        skippedCount: skipped,
        flakyCount: flaky,
        erroredCount: 0,
        results,
        pipelineRunId: pipelineId,
        isRerun: false,
        originalRunId: null,
      });

      // ~15% of FAILED runs generate a re-run
      if (runStatus === 'FAILED' && rng() < 0.15) {
        const rerunId = uuid(rng);
        const rerunPipelineId = uuid(rng);
        const rerunStartedAt = new Date(startedAt.getTime() + totalDuration + Math.floor(rng() * 120000) + 30000);
        const rerunPassRate = Math.min(0.99, clampedPassRate + 0.15);

        const rerunResults: DemoTestResult[] = runTests.map(tc => {
          let rstatus: 'PASSED' | 'FAILED' | 'SKIPPED' | 'FLAKY';
          if (rng() < 0.03) {
            rstatus = 'SKIPPED';
          } else if (flakyTestIds.has(tc.id) && rng() < 0.4) {
            rstatus = 'FLAKY';
          } else if (rng() > rerunPassRate) {
            rstatus = 'FAILED';
          } else {
            rstatus = 'PASSED';
          }
          return {
            id: uuid(rng),
            testCaseId: tc.id,
            status: rstatus,
            durationMs: Math.floor(100 + rng() * 15000),
            ...(rstatus === 'FAILED' || rstatus === 'FLAKY'
              ? { errorMessage: `AssertionError: expected ${Math.floor(rng() * 100)} to equal ${Math.floor(rng() * 100)}` }
              : {}),
          };
        });

        const rerunPassed = rerunResults.filter(r => r.status === 'PASSED').length;
        const rerunFailed = rerunResults.filter(r => r.status === 'FAILED').length;
        const rerunSkipped = rerunResults.filter(r => r.status === 'SKIPPED').length;
        const rerunFlaky = rerunResults.filter(r => r.status === 'FLAKY').length;
        const rerunTotalDuration = rerunResults.reduce((s, r) => s + r.durationMs, 0);
        const rerunStatus = rerunFailed > 0 ? 'FAILED' as const : 'PASSED' as const;

        pipelineRuns.push({
          id: rerunPipelineId,
          workflowName: workflow,
          branch,
          sha,
          status: rerunStatus === 'PASSED' ? 'SUCCESS' : 'FAILURE',
          durationMs: rerunTotalDuration + Math.floor(rng() * 30000),
          triggeredBy: actor,
          startedAt: rerunStartedAt,
        });

        testRuns.push({
          id: rerunId,
          name: `${runName} (re-run)`,
          triggerType,
          branch,
          sha,
          environment: env,
          startedAt: rerunStartedAt,
          durationMs: rerunTotalDuration,
          status: rerunStatus,
          totalTests: rerunResults.length,
          passedCount: rerunPassed,
          failedCount: rerunFailed,
          skippedCount: rerunSkipped,
          flakyCount: rerunFlaky,
          erroredCount: 0,
          results: rerunResults,
          pipelineRunId: rerunPipelineId,
          isRerun: true,
          originalRunId: runId,
        });
      }
    }
  }

  // Defects
  const defects: DemoDefect[] = [];
  for (let i = 0; i < config.defectCount; i++) {
    const fa = pick(rng, featureAreas);
    const createdAt = new Date(now.getTime() - rng() * config.daysOfHistory * 86400000);
    const isResolved = rng() > 0.35;
    const resolvedAt = isResolved ? new Date(createdAt.getTime() + rng() * 14 * 86400000) : null;
    const isClosed = isResolved && rng() > 0.2;
    const status = isClosed
      ? (rng() > 0.9 ? 'REOPENED' : 'CLOSED')
      : isResolved
        ? 'RESOLVED'
        : rng() > 0.5
          ? 'IN_PROGRESS'
          : 'OPEN';

    const closedAt = isClosed ? new Date((resolvedAt?.getTime() ?? createdAt.getTime()) + rng() * 3 * 86400000) : null;

    // Build realistic changelog based on status transitions
    const changelog: DemoDefectChangelogEntry[] = [];
    let cursor = createdAt.getTime();

    if (status !== 'OPEN') {
      // OPEN -> IN_PROGRESS (after 1-3 days)
      const inProgressAt = new Date(cursor + (1 + rng() * 2) * 86400000);
      changelog.push({ from: 'OPEN', to: 'IN_PROGRESS', at: inProgressAt });
      cursor = inProgressAt.getTime();
    }
    if (isResolved) {
      // IN_PROGRESS -> RESOLVED (after 2-7 days)
      const resolvedTransitionAt = new Date(cursor + (2 + rng() * 5) * 86400000);
      changelog.push({ from: 'IN_PROGRESS', to: 'RESOLVED', at: resolvedTransitionAt });
      cursor = resolvedTransitionAt.getTime();
    }
    if (isClosed && status !== 'REOPENED') {
      // RESOLVED -> CLOSED (after 1-3 days)
      const closedTransitionAt = new Date(cursor + (1 + rng() * 2) * 86400000);
      changelog.push({ from: 'RESOLVED', to: 'CLOSED', at: closedTransitionAt });
      cursor = closedTransitionAt.getTime();
    }
    if (status === 'REOPENED') {
      // RESOLVED -> CLOSED first, then CLOSED -> REOPENED
      const closedTransitionAt = new Date(cursor + (1 + rng() * 2) * 86400000);
      changelog.push({ from: 'RESOLVED', to: 'CLOSED', at: closedTransitionAt });
      cursor = closedTransitionAt.getTime();

      const reopenedAt = new Date(cursor + (3 + rng() * 7) * 86400000);
      changelog.push({ from: 'CLOSED', to: 'REOPENED', at: reopenedAt });
      cursor = reopenedAt.getTime();

      const backInProgressAt = new Date(cursor + (0.5 + rng() * 1) * 86400000);
      changelog.push({ from: 'REOPENED', to: 'IN_PROGRESS', at: backInProgressAt });
    }

    defects.push({
      id: uuid(rng),
      externalId: `BUG-${2000 + i}`,
      url: null,
      title: pick(rng, BUG_TEMPLATES) + ` (${fa.name})`,
      severity: pickWeighted(rng, SEVERITIES, [5, 15, 50, 30]),
      priority: pickWeighted(rng, PRIORITIES, [5, 15, 50, 30]),
      status,
      component: fa.name,
      featureAreaId: fa.id,
      labels: [
        ...(rng() < 0.15 ? ['production'] : []),
        ...(rng() < 0.3 ? [pick(rng, ['regression', 'flaky', 'blocker', 'P0-hotfix', 'tech-debt'])] : []),
      ],
      isEscaped: rng() < 0.15,
      reopenCount: status === 'REOPENED' ? Math.ceil(rng() * 3) : 0,
      createdAt,
      resolvedAt,
      closedAt,
      changelog,
    });
  }

  // Stories
  const stories: DemoStory[] = [];
  const storyCount = Math.round(config.defectCount * 0.8);
  for (let i = 0; i < storyCount; i++) {
    const fa = pick(rng, featureAreas);
    const createdAt = new Date(now.getTime() - rng() * config.daysOfHistory * 86400000);
    const isResolved = rng() > 0.4;
    const resolvedAt = isResolved ? new Date(createdAt.getTime() + rng() * 21 * 86400000) : null;
    const status: DemoStory['status'] = isResolved
      ? (rng() > 0.3 ? 'CLOSED' : 'RESOLVED')
      : rng() > 0.5 ? 'IN_PROGRESS' : 'OPEN';
    const labelCount = Math.floor(rng() * 3);
    const labels: string[] = [];
    for (let l = 0; l < labelCount; l++) labels.push(pick(rng, STORY_LABELS));

    stories.push({
      id: uuid(rng),
      externalId: `PS-${3000 + i}`,
      title: pick(rng, STORY_TEMPLATES) + ` (${fa.name})`,
      url: `https://jira.example.com/browse/PS-${3000 + i}`,
      status,
      storyPoints: rng() > 0.1 ? pick(rng, STORY_POINTS) : null,
      assignee: pick(rng, ACTORS),
      component: fa.name,
      labels: [...new Set(labels)],
      createdAt,
      resolvedAt,
    });
  }

  // KPI snapshots — one per day per metric
  const kpiSnapshots: DemoKPISnapshot[] = [];
  const metrics = [
    { name: 'COVERAGE_PCT', target: 80, base: 65, trend: 0.15 },
    { name: 'PASS_RATE_7D', target: 90, base: 82, trend: 0.08 },
    { name: 'PASS_RATE_30D', target: 90, base: 84, trend: 0.06 },
    { name: 'FLAKY_RATE', target: 5, base: 12, trend: -0.07 },
    { name: 'MTTD_HOURS', target: 2, base: 8, trend: -0.04 },
    { name: 'MTTR_HOURS', target: 24, base: 72, trend: -0.3 },
    { name: 'ESCAPE_RATE', target: 10, base: 18, trend: -0.08 },
    { name: 'EXEC_VELOCITY', target: 100, base: 40, trend: 0.5 },
    { name: 'REQ_COVERAGE', target: 75, base: 55, trend: 0.2 },
    { name: 'READINESS_SCORE', target: 80, base: 60, trend: 0.2 },
  ];

  for (let day = config.daysOfHistory; day >= 0; day--) {
    const dayProgress = 1 - day / config.daysOfHistory;
    const recordedAt = new Date(now.getTime() - day * 86400000);
    for (const m of metrics) {
      const noise = (rng() - 0.5) * m.base * 0.1;
      const value = Math.max(0, m.base + m.trend * dayProgress * m.base + noise);
      kpiSnapshots.push({
        id: uuid(rng),
        metric: m.name,
        value: Math.round(value * 100) / 100,
        target: m.target,
        recordedAt,
      });
    }
  }

  return { featureAreas, testCases, testRuns, defects, stories, pipelineRuns, kpiSnapshots };
}
