import nock from 'nock';
import AdmZip from 'adm-zip';
import { GitHubConnector } from './github.connector';
import type { ConnectorConfig } from '@qod/shared';

const GITHUB_API = 'https://api.github.com';

function makeConfig(overrides: Partial<ConnectorConfig> = {}): ConnectorConfig {
  return {
    id: 'conn-1',
    connectorType: 'github',
    credentials: { token: 'ghp_testtoken123', owner: 'my-org', repo: 'my-repo' },
    fieldMapping: {},
    syncSchedule: '*/15 * * * *',
    ...overrides,
  };
}

const mockUser = {
  login: 'octocat',
  id: 1,
  name: 'The Octocat',
  email: 'octocat@github.com',
};

function mockWorkflowRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 123456,
    name: 'CI Pipeline',
    head_branch: 'main',
    head_sha: 'abc123def456',
    status: 'completed',
    conclusion: 'success',
    html_url: 'https://github.com/my-org/my-repo/actions/runs/123456',
    run_started_at: '2025-01-15T10:00:00Z',
    updated_at: '2025-01-15T10:05:30Z',
    actor: { login: 'octocat' },
    ...overrides,
  };
}

function mockJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 789,
    name: 'build',
    conclusion: 'success',
    started_at: '2025-01-15T10:00:10Z',
    completed_at: '2025-01-15T10:03:20Z',
    steps: [
      {
        name: 'Checkout',
        conclusion: 'success',
        started_at: '2025-01-15T10:00:10Z',
        completed_at: '2025-01-15T10:00:15Z',
      },
    ],
    ...overrides,
  };
}

describe('GitHubConnector', () => {
  let connector: GitHubConnector;

  beforeEach(() => {
    connector = new GitHubConnector();
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('has correct name and type', () => {
    expect(connector.name).toBe('github');
    expect(connector.type).toBe('ci');
  });

  it('bounds internal concurrent artifact work', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    const result = await (connector as any).mapWithConcurrency(
      [1, 2, 3, 4, 5],
      2,
      async (value: number) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
        return value * 2;
      },
    );

    expect(result).toEqual([2, 4, 6, 8, 10]);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  // ──────────────── authenticate ────────────────

  describe('authenticate', () => {
    it('returns success when token is valid (200)', async () => {
      nock(GITHUB_API)
        .get('/user')
        .matchHeader('Authorization', 'Bearer ghp_testtoken123')
        .matchHeader('Accept', 'application/vnd.github+json')
        .reply(200, mockUser);

      const result = await connector.authenticate(makeConfig());

      expect(result.success).toBe(true);
      expect(result.metadata).toEqual({ login: 'octocat', name: 'The Octocat' });
    });

    it('returns error when token is invalid (401)', async () => {
      nock(GITHUB_API)
        .get('/user')
        .reply(401, { message: 'Bad credentials' });

      const result = await connector.authenticate(makeConfig());

      expect(result.success).toBe(false);
      expect(result.error).toContain('Bad credentials');
    });
  });

  // ──────────────── testConnection ────────────────

  describe('testConnection', () => {
    it('returns success when token is valid', async () => {
      nock(GITHUB_API)
        .get('/user')
        .reply(200, mockUser);

      const result = await connector.testConnection(makeConfig());

      expect(result.success).toBe(true);
    });

    it('returns error when token is invalid', async () => {
      nock(GITHUB_API)
        .get('/user')
        .reply(401, { message: 'Bad credentials' });

      const result = await connector.testConnection(makeConfig());

      expect(result.success).toBe(false);
      expect(result.error).toContain('Bad credentials');
    });
  });

  // ──────────────── fetchPipelineRuns ────────────────

  describe('fetchPipelineRuns', () => {
    const since = new Date('2025-01-15T00:00:00Z');

    it('fetches workflow runs and maps them to NormalizedPipelineRun', async () => {
      const run = mockWorkflowRun();

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs')
        .query({ per_page: '10', page: '1' })
        .reply(200, { total_count: 1, workflow_runs: [run] });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/123456/jobs')
        .query({ per_page: 100 })
        .reply(200, { total_count: 1, jobs: [mockJob()] });

      const results = await connector.fetchPipelineRuns!(makeConfig(), since);

      expect(results).toHaveLength(1);
      const r = results[0];
      expect(r.externalId).toBe('123456');
      expect(r.workflowName).toBe('CI Pipeline');
      expect(r.branch).toBe('main');
      expect(r.sha).toBe('abc123def456');
      expect(r.status).toBe('SUCCESS');
      expect(r.durationMs).toBe(330000); // 5min 30sec
      expect(r.triggeredBy).toBe('octocat');
      expect(r.startedAt).toEqual(new Date('2025-01-15T10:00:00Z'));
      expect(r.url).toBe('https://github.com/my-org/my-repo/actions/runs/123456');
      expect(r.jobs).toHaveLength(1);
      expect(r.jobs[0].name).toBe('build');
      expect(r.jobs[0].status).toBe('success');
      expect(r.jobs[0].durationMs).toBe(190000); // 3min 10sec
    });

    it('maps status: completed+failure -> FAILURE', async () => {
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs')
        .query(true)
        .reply(200, {
          total_count: 1,
          workflow_runs: [mockWorkflowRun({ id: 2, conclusion: 'failure' })],
        });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/2/jobs')
        .query(true)
        .reply(200, { total_count: 0, jobs: [] });

      const results = await connector.fetchPipelineRuns!(makeConfig(), since);
      expect(results[0].status).toBe('FAILURE');
    });

    it('maps status: in_progress -> IN_PROGRESS', async () => {
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs')
        .query(true)
        .reply(200, {
          total_count: 1,
          workflow_runs: [mockWorkflowRun({ id: 3, status: 'in_progress', conclusion: null })],
        });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/3/jobs')
        .query(true)
        .reply(200, { total_count: 0, jobs: [] });

      const results = await connector.fetchPipelineRuns!(makeConfig(), since);
      expect(results[0].status).toBe('IN_PROGRESS');
    });

    it('maps status: queued -> QUEUED', async () => {
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs')
        .query(true)
        .reply(200, {
          total_count: 1,
          workflow_runs: [mockWorkflowRun({ id: 4, status: 'queued', conclusion: null })],
        });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/4/jobs')
        .query(true)
        .reply(200, { total_count: 0, jobs: [] });

      const results = await connector.fetchPipelineRuns!(makeConfig(), since);
      expect(results[0].status).toBe('QUEUED');
    });

    it('maps status: completed+cancelled -> CANCELLED', async () => {
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs')
        .query(true)
        .reply(200, {
          total_count: 1,
          workflow_runs: [mockWorkflowRun({ id: 5, conclusion: 'cancelled' })],
        });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/5/jobs')
        .query(true)
        .reply(200, { total_count: 0, jobs: [] });

      const results = await connector.fetchPipelineRuns!(makeConfig(), since);
      expect(results[0].status).toBe('CANCELLED');
    });

    it('returns multiple runs from a single page', async () => {
      const run1 = mockWorkflowRun({ id: 100, name: 'Run 1' });
      const run2 = mockWorkflowRun({ id: 200, name: 'Run 2' });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs')
        .query({ per_page: '10', page: '1' })
        .reply(200, { total_count: 2, workflow_runs: [run1, run2] });

      // Jobs for both runs
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/100/jobs')
        .query(true)
        .reply(200, { total_count: 0, jobs: [] });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/200/jobs')
        .query(true)
        .reply(200, { total_count: 0, jobs: [] });

      const results = await connector.fetchPipelineRuns!(makeConfig(), since);
      expect(results).toHaveLength(2);
      expect(results[0].externalId).toBe('100');
      expect(results[1].externalId).toBe('200');
    });

    it('fetches without since parameter (defaults to last 30 days)', async () => {
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs')
        .query(true) // defaults to 30-day lookback, so created param is dynamic
        .reply(200, { total_count: 0, workflow_runs: [] });

      const results = await connector.fetchPipelineRuns!(makeConfig());
      expect(results).toHaveLength(0);
    });

    it('includes job steps in the response', async () => {
      const run = mockWorkflowRun();
      const job = mockJob({
        steps: [
          { name: 'Checkout', conclusion: 'success', started_at: '2025-01-15T10:00:10Z', completed_at: '2025-01-15T10:00:15Z' },
          { name: 'Build', conclusion: 'success', started_at: '2025-01-15T10:00:15Z', completed_at: '2025-01-15T10:02:00Z' },
        ],
      });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs')
        .query(true)
        .reply(200, { total_count: 1, workflow_runs: [run] });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/123456/jobs')
        .query(true)
        .reply(200, { total_count: 1, jobs: [job] });

      const results = await connector.fetchPipelineRuns!(makeConfig(), since);
      const steps = results[0].jobs[0].steps!;
      expect(steps).toHaveLength(2);
      expect(steps[0].name).toBe('Checkout');
      expect(steps[0].status).toBe('success');
      expect(steps[0].durationMs).toBe(5000);
      expect(steps[1].name).toBe('Build');
      expect(steps[1].durationMs).toBe(105000);
    });
  });

  // ──────────────── fetchTestRuns (Allure artifacts) ────────────────

  describe('fetchTestRuns', () => {
    function makeAllureConfig(): ConnectorConfig {
      return makeConfig({
        credentials: {
          token: 'ghp_testtoken123',
          owner: 'my-org',
          repo: 'my-repo',
          workflowFile: 'e2e.yml',
          branch: 'develop',
          maxRuns: 2,
        },
      });
    }

    function makeAllureResultZip(
      results: Array<{ name: string; status: string; testRailId?: string; historyId?: string; parameters?: Array<{ name: string; value: string }>; start?: number; stop?: number }>
    ): Buffer {
      const zip = new AdmZip();
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const json = {
          uuid: `uuid-${i}`,
          historyId: r.historyId,
          name: r.name,
          status: r.status,
          statusDetails: r.status === 'failed' ? { message: 'Assertion failed', trace: 'at Test.java:42' } : {},
          labels: r.testRailId ? [{ name: 'tag', value: `TestRailId:${r.testRailId}` }] : [],
          parameters: r.parameters,
          start: r.start ?? 1700000000000,
          stop: r.stop ?? 1700000005000,
        };
        // Simulate real structure: files inside allure-results-merged/
        zip.addFile(`allure-results-merged/uuid-${i}-result.json`, Buffer.from(JSON.stringify(json)));
      }
      return zip.toBuffer();
    }

    /**
     * Build an Allure zip from raw JSON entries — lets tests verify TestRailId
     * extraction from tms/links/name/etc. patterns that the simpler helper
     * above does not cover.
     */
    function makeAllureZipRaw(entries: Array<Record<string, unknown>>): Buffer {
      const zip = new AdmZip();
      entries.forEach((json, i) => {
        zip.addFile(
          `allure-results-merged/${(json.name as string).replace(/\s/g, '_')}-${i}-result.json`,
          Buffer.from(JSON.stringify(json)),
        );
      });
      return zip.toBuffer();
    }

    it('falls back to all workflows when no workflowFile is configured', async () => {
      // Without workflowFile we should still ingest workflow runs so failed/
      // setup-only builds populate test_runs.  Use the all-workflows endpoint
      // filtered by branch (default: main) AND status=completed so queued/
      // in-progress runs do not consume slots in the maxRuns page.
      const run = mockWorkflowRun({ id: 555, run_number: 7, head_branch: 'main' });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs')
        .query({ per_page: '10', page: '1', branch: 'main', status: 'completed' })
        .reply(200, { workflow_runs: [run] });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/555/jobs')
        .query(true)
        .reply(200, { jobs: [] });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/555/artifacts')
        .query(true)
        .reply(200, { artifacts: [] });

      const results = await connector.fetchTestRuns!(makeConfig());
      expect(results).toHaveLength(1);
      expect(results[0].externalId).toBe('gh-555');
      expect(results[0].results).toHaveLength(0);
    });

    it('emits a NormalizedTestRun for failed builds with no artifacts', async () => {
      // Lint/setup failures never upload Allure — they must still appear in
      // test_runs so Run Health and Daily Run Results count them. When per-
      // test data is unavailable the connector falls back to job conclusions
      // for run-level counts so the Run History "Tests" column is non-zero.
      const run = mockWorkflowRun({
        id: 666,
        run_number: 13,
        status: 'completed',
        conclusion: 'failure',
        head_branch: 'develop',
      });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/workflows/e2e.yml/runs')
        .query(true)
        .reply(200, { workflow_runs: [run] });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/666/jobs')
        .query(true)
        .reply(200, {
          jobs: [
            { id: 1, name: 'lint', conclusion: 'failure', started_at: '2025-01-15T10:00:00Z', completed_at: '2025-01-15T10:00:30Z' },
          ],
        });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/666/artifacts')
        .query(true)
        .reply(200, { artifacts: [] });

      const results = await connector.fetchTestRuns!(makeAllureConfig());
      expect(results).toHaveLength(1);
      expect(results[0].externalId).toBe('gh-666');
      expect(results[0].status).toBe('FAILED');
      expect(results[0].results).toHaveLength(0);
      // 1 lint job, conclusion=failure → 1 failed unit
      expect(results[0].summaryCounts).toEqual({
        totalTests: 1,
        passedCount: 0,
        failedCount: 1,
        skippedCount: 0,
        erroredCount: 0,
      });
      // Run is shard-fallback only, so countSource must signal CI_JOBS so
      // the UI labels it as shards (not test cases).
      expect(results[0].countSource).toBe('CI_JOBS');
    });

    it('falls back to shard counts when shards passed but no Allure artifacts uploaded', async () => {
      // Repro for the "(15 shards passed) → 0/0/0" issue: workflow ran 15
      // sharded jobs all green but never uploaded Allure artifacts (or
      // uploaded under a non-default name). The Run History column was
      // showing 0/0/0; with the shard-count fallback it should now show
      // passed=15 / failed=0 / skipped=0.
      const run = mockWorkflowRun({
        id: 6266,
        run_number: 6266,
        status: 'completed',
        conclusion: 'success',
        head_branch: 'develop',
      });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/workflows/e2e.yml/runs')
        .query(true)
        .reply(200, { workflow_runs: [run] });

      const shardCount = 15;
      const jobs = Array.from({ length: shardCount }, (_, i) => ({
        id: 1000 + i,
        name: `E2E Tests (Shard ${i + 1} of ${shardCount})`,
        conclusion: 'success',
        started_at: '2025-01-15T10:00:00Z',
        completed_at: '2025-01-15T10:30:00Z',
      }));
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/6266/jobs')
        .query(true)
        .reply(200, { jobs });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/6266/artifacts')
        .query(true)
        .reply(200, { artifacts: [] });

      const results = await connector.fetchTestRuns!(makeAllureConfig());
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('PASSED');
      expect(results[0].results).toHaveLength(0);
      expect(results[0].summaryCounts).toEqual({
        totalTests: 15,
        passedCount: 15,
        failedCount: 0,
        skippedCount: 0,
        erroredCount: 0,
      });
    });

    it('does not emit summaryCounts when per-test results are present', async () => {
      // When Allure data IS parsed, results take precedence — summaryCounts
      // must stay undefined so SyncService keeps using per-test counts.
      const run = mockWorkflowRun({
        id: 970,
        run_number: 970,
        status: 'completed',
        conclusion: 'success',
        head_branch: 'develop',
      });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/workflows/e2e.yml/runs')
        .query(true)
        .reply(200, { workflow_runs: [run] });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/970/jobs')
        .query(true)
        .reply(200, {
          jobs: [
            { id: 1, name: 'E2E Tests (Shard 1 of 1)', conclusion: 'success', started_at: '2025-01-15T10:00:00Z', completed_at: '2025-01-15T10:05:00Z' },
          ],
        });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/970/artifacts')
        .query(true)
        .reply(200, {
          artifacts: [
            { id: 970, name: 'allure-results-shard-1', size_in_bytes: 500, expired: false },
          ],
        });

      const zip = makeAllureResultZip([
        { name: 'Login', status: 'passed', testRailId: 'C9001' },
      ]);
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/artifacts/970/zip')
        .reply(200, zip, { 'Content-Type': 'application/zip' });

      const results = await connector.fetchTestRuns!(makeAllureConfig());
      expect(results[0].results).toHaveLength(1);
      expect(results[0].summaryCounts).toBeUndefined();
    });

    it('emits a run when only expired artifacts are present', async () => {
      const run = mockWorkflowRun({ id: 777, run_number: 14, head_branch: 'develop', conclusion: 'success' });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/workflows/e2e.yml/runs')
        .query(true)
        .reply(200, { workflow_runs: [run] });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/777/jobs')
        .query(true)
        .reply(200, { jobs: [] });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/777/artifacts')
        .query(true)
        .reply(200, {
          artifacts: [
            { id: 99, name: 'allure-results-shard-1', size_in_bytes: 500, expired: true },
          ],
        });

      const results = await connector.fetchTestRuns!(makeAllureConfig());
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('PASSED');
      expect(results[0].results).toHaveLength(0);
    });

    it('falls through to broader Allure name variants (allure-results-N, allure-results-merged) when strict shard pattern misses', async () => {
      // Repos that upload `allure-results-1` / `allure-results-2` (no
      // `shard-` infix) or a single merged `allure-results-merged` artifact
      // were previously dropped, leading to summary-only runs. The broader
      // tier should pick them up and parse real test data.
      const run = mockWorkflowRun({ id: 920, run_number: 920, status: 'completed', conclusion: 'success', head_branch: 'develop' });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/workflows/e2e.yml/runs')
        .query(true)
        .reply(200, { workflow_runs: [run] });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/920/jobs')
        .query(true)
        .reply(200, {
          jobs: [{ id: 1, name: 'E2E Tests (Shard 1 of 1)', conclusion: 'success', started_at: '2025-01-15T10:00:00Z', completed_at: '2025-01-15T10:05:00Z' }],
        });

      // Two artifacts: a non-`shard-` indexed one and a merged one. The
      // strict tier 2 (`allure-results-shard-N`) should miss; tier 3 should
      // accept both.
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/920/artifacts')
        .query(true)
        .reply(200, {
          artifacts: [
            { id: 9201, name: 'allure-results-1', size_in_bytes: 500, expired: false },
            { id: 9202, name: 'allure-results-merged', size_in_bytes: 500, expired: false },
          ],
        });

      const zip1 = makeAllureResultZip([{ name: 'Login', status: 'passed', testRailId: 'C920' }]);
      const zip2 = makeAllureResultZip([{ name: 'Logout', status: 'passed', testRailId: 'C921' }]);
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/artifacts/9201/zip')
        .reply(200, zip1, { 'Content-Type': 'application/zip' });
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/artifacts/9202/zip')
        .reply(200, zip2, { 'Content-Type': 'application/zip' });

      const results = await connector.fetchTestRuns!(makeAllureConfig());
      expect(results).toHaveLength(1);
      // Both artifacts parsed → 2 test cases linked to TestRail IDs.
      expect(results[0].results.map((r) => r.testExternalId).sort()).toEqual(['920', '921']);
      // Real test data, so countSource must be TEST_RESULTS (not CI_JOBS).
      expect(results[0].countSource).toBe('TEST_RESULTS');
    });

    it('parses built Allure HTML reports (data/test-cases/*.json) when raw results are absent', async () => {
      // Some workflows upload only the GENERATED Allure 2 report (the HTML
      // dashboard). The connector should fall back to parsing that
      // structure so tests still link by TestRail ID and Run History shows
      // real per-test counts. Within-run FLAKY detection is lost on this
      // path (built reports collapse retries) — acceptable trade-off.
      const run = mockWorkflowRun({ id: 930, run_number: 930, status: 'completed', conclusion: 'success', head_branch: 'develop' });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/workflows/e2e.yml/runs')
        .query(true)
        .reply(200, { workflow_runs: [run] });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/930/jobs')
        .query(true)
        .reply(200, {
          jobs: [{ id: 1, name: 'E2E Tests (Shard 1 of 1)', conclusion: 'success', started_at: '2025-01-15T10:00:00Z', completed_at: '2025-01-15T10:05:00Z' }],
        });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/930/artifacts')
        .query(true)
        .reply(200, {
          artifacts: [
            { id: 9301, name: 'allure-report-shard-13.zip', size_in_bytes: 500, expired: false },
          ],
        });

      // Build a zip that has NO `*-result.json` raw entries — only the
      // built-report `data/test-cases/<uuid>.json` shape.
      const zip = new AdmZip();
      const builtTc = {
        name: 'Verify accrual activity',
        fullName: 'tests.AccrualTest.Verify accrual activity',
        status: 'passed',
        time: { duration: 12_345 },
        labels: [{ name: 'tms', value: 'C4570' }],
      };
      zip.addFile('allure-report/data/test-cases/abcd-1234.json', Buffer.from(JSON.stringify(builtTc)));
      const builtTc2 = { name: 'Failing test', status: 'failed', time: { duration: 100 },
        statusMessage: 'Expected true got false',
        labels: [{ name: 'tag', value: 'C4571' }] };
      zip.addFile('allure-report/data/test-cases/efgh-5678.json', Buffer.from(JSON.stringify(builtTc2)));
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/artifacts/9301/zip')
        .reply(200, zip.toBuffer(), { 'Content-Type': 'application/zip' });

      const results = await connector.fetchTestRuns!(makeAllureConfig());
      expect(results).toHaveLength(1);
      const ids = results[0].results.map((r) => r.testExternalId).sort();
      expect(ids).toEqual(['4570', '4571']);
      const passed = results[0].results.find((r) => r.testExternalId === '4570');
      expect(passed?.status).toBe('PASSED');
      expect(passed?.durationMs).toBe(12_345);
      const failed = results[0].results.find((r) => r.testExternalId === '4571');
      expect(failed?.status).toBe('FAILED');
      expect(failed?.errorMessage).toBe('Expected true got false');
      // Built-report data is real per-test data → countSource TEST_RESULTS.
      expect(results[0].countSource).toBe('TEST_RESULTS');
    });

    it('falls back to built Allure report artifacts when raw Allure artifacts parse zero results', async () => {
      // The Fineract workflow uploads both `allure-results-shard-N` and
      // `allure-report-shard-N.zip`. If the raw-results artifact is empty,
      // malformed, unavailable, or otherwise unparseable, the connector must
      // try the built report before falling back to misleading shard counts.
      const run = mockWorkflowRun({ id: 931, run_number: 931, status: 'completed', conclusion: 'success', head_branch: 'develop' });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/workflows/e2e.yml/runs')
        .query(true)
        .reply(200, { workflow_runs: [run] });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/931/jobs')
        .query(true)
        .reply(200, {
          jobs: [{ id: 1, name: 'E2E Tests (Shard 13 of 15)', conclusion: 'success', started_at: '2025-01-15T10:00:00Z', completed_at: '2025-01-15T10:05:00Z' }],
        });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/931/artifacts')
        .query(true)
        .reply(200, {
          artifacts: [
            { id: 9311, name: 'allure-results-shard-13', size_in_bytes: 500, expired: false },
            { id: 9312, name: 'allure-report-shard-13.zip', size_in_bytes: 500, expired: false },
          ],
        });

      const emptyRawZip = new AdmZip();
      emptyRawZip.addFile('README.txt', Buffer.from('raw upload missing result json'));
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/artifacts/9311/zip')
        .reply(200, emptyRawZip.toBuffer(), { 'Content-Type': 'application/zip' });

      const builtZip = new AdmZip();
      builtZip.addFile(
        'data/test-cases/case-76629.json',
        Buffer.from(JSON.stringify({
          name: 'Validate loan repayment schedule',
          fullName: 'org.apache.fineract.e2e.Loans.Validate loan repayment schedule',
          status: 'passed',
          time: { duration: 51_000 },
          labels: [{ name: 'tag', value: 'TestRailId:C76629' }],
          extra: { tags: ['TestRailId:C76629'] },
        })),
      );
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/artifacts/9312/zip')
        .reply(200, builtZip.toBuffer(), { 'Content-Type': 'application/zip' });

      const results = await connector.fetchTestRuns!(makeAllureConfig());
      expect(results).toHaveLength(1);
      expect(results[0].countSource).toBe('TEST_RESULTS');
      expect(results[0].summaryCounts).toBeUndefined();
      expect(results[0].results).toHaveLength(1);
      expect(results[0].results[0].testExternalId).toBe('76629');
      expect(results[0].results[0].status).toBe('PASSED');

      const diag = (connector as any).getDiagnostics();
      expect(diag.runsWithoutParsedResults).toBe(0);
      expect(diag.runsWithoutMatchedArtifacts).toBe(0);
      expect(diag.runsWithDownloadFailures).toBe(0);
    });

    it('exposes diagnostics so SyncService can surface artifact-mismatch warnings', async () => {
      // Three runs in a row whose artifacts use a non-default name. The
      // connector should ingest the runs (with shard-fallback counts) AND
      // report via getDiagnostics() that artifact patterns appear
      // misconfigured so SyncService can mark the connector with a soft
      // warning.
      const runs = [930, 931, 932].map((id) =>
        mockWorkflowRun({ id, run_number: id, status: 'completed', conclusion: 'success', head_branch: 'develop' }),
      );

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/workflows/e2e.yml/runs')
        .query(true)
        .reply(200, { workflow_runs: runs });

      for (const id of [930, 931, 932]) {
        nock(GITHUB_API)
          .get(`/repos/my-org/my-repo/actions/runs/${id}/jobs`)
          .query(true)
          .reply(200, {
            jobs: [{ id: 1, name: 'E2E Tests (Shard 1 of 3)', conclusion: 'success', started_at: '2025-01-15T10:00:00Z', completed_at: '2025-01-15T10:05:00Z' }],
          });
        nock(GITHUB_API)
          .get(`/repos/my-org/my-repo/actions/runs/${id}/artifacts`)
          .query(true)
          .reply(200, {
            artifacts: [
              // Custom name that doesn't match any default pattern.
              { id: 100 + id, name: 'custom-e2e-results', size_in_bytes: 500, expired: false },
            ],
          });
      }

      const config = makeConfig({
        credentials: {
          token: 'ghp_testtoken123',
          owner: 'my-org',
          repo: 'my-repo',
          workflowFile: 'e2e.yml',
          branch: 'develop',
          maxRuns: 3,
        },
      });
      const out = await connector.fetchTestRuns!(config);
      expect(out).toHaveLength(3);
      // All three runs fall back to shard counts because nothing matched.
      for (const r of out) expect(r.countSource).toBe('CI_JOBS');

      const diag = (connector as any).getDiagnostics();
      expect(diag.completedRuns).toBe(3);
      // All three runs hit name-mismatch — the dedicated counter, not the
      // generic "results empty" one (Codex review).
      expect(diag.runsWithoutMatchedArtifacts).toBe(3);
      expect(diag.runsWithoutParsedResults).toBe(0);
      expect(diag.sampleUnmatchedArtifactNames).toContain('custom-e2e-results');
    });

    it('falls back to JUnit XML parsing when artifact has no Allure JSON', async () => {
      // User-reported: workflows that publish JUnit XML (e.g. surefire,
      // pytest --junit-xml, gradle test reports) inside an artifact named
      // `allure-results-shard-N` were producing 0 results because the
      // connector only looked for `*-result.json`. Adding tier-3 JUnit
      // XML fallback fixes this without requiring users to reconfigure.
      const run = mockWorkflowRun({ id: 1010, run_number: 1010, status: 'completed', conclusion: 'success', head_branch: 'develop' });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/workflows/e2e.yml/runs')
        .query(true)
        .reply(200, { workflow_runs: [run] });
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/1010/jobs')
        .query(true)
        .reply(200, { jobs: [{ id: 1, name: 'E2E Tests (Shard 1 of 1)', conclusion: 'success', started_at: '2025-01-15T10:00:00Z', completed_at: '2025-01-15T10:05:00Z' }] });
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/1010/artifacts')
        .query(true)
        .reply(200, { artifacts: [{ id: 1010, name: 'allure-results-shard-1', size_in_bytes: 500, expired: false }] });

      // Zip contains JUnit XML, NOT raw Allure or built-report JSON.
      const junitXml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="com.example.LoanTest" tests="3" failures="1" time="2.5">
    <testcase name="testCreate" classname="com.example.LoanTest" time="0.5"/>
    <testcase name="testUpdate" classname="com.example.LoanTest" time="1.0">
      <failure message="Expected 200 got 500"/>
    </testcase>
    <testcase name="testDelete" classname="com.example.LoanTest" time="1.0">
      <skipped/>
    </testcase>
  </testsuite>
</testsuites>`;
      const zip = new AdmZip();
      zip.addFile('TEST-com.example.LoanTest.xml', Buffer.from(junitXml));
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/artifacts/1010/zip')
        .reply(200, zip.toBuffer(), { 'Content-Type': 'application/zip' });

      const out = await connector.fetchTestRuns!(makeAllureConfig());
      expect(out).toHaveLength(1);
      // Three distinct testcases parsed from JUnit XML.
      expect(out[0].results).toHaveLength(3);
      const byTitle = (title: string) => out[0].results.find((r) => r.testTitle === title);
      expect(byTitle('testCreate')?.status).toBe('PASSED');
      expect(byTitle('testUpdate')?.status).toBe('FAILED');
      expect(byTitle('testUpdate')?.errorMessage).toBe('Expected 200 got 500');
      expect(byTitle('testDelete')?.status).toBe('SKIPPED');
      // Real per-test data was parsed → countSource is TEST_RESULTS, not
      // shard-fallback CI_JOBS.
      expect(out[0].countSource).toBe('TEST_RESULTS');
    });

    it('preserves parametrized variants as distinct results when they share a TmsLink', async () => {
      // User-reported regression on PR #16: a workflow with 100 test methods
      // each tagged @TmsLink("Cxxx") and run with 20 data-driven variants
      // produced ~100 results in Run History instead of the expected 2 000.
      // Root cause: the dedup key was `testRailId || generateTestId(name,
      // suite)`, so all variants of one method (sharing TmsLink AND name)
      // collapsed into one result. The new dedup uses Allure's `historyId`
      // — same across true retries of the same variant, different across
      // parametrized variants — so variants stay distinct while real
      // retries still merge.
      const run = mockWorkflowRun({ id: 950, run_number: 950, status: 'completed', conclusion: 'success', head_branch: 'develop' });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/workflows/e2e.yml/runs')
        .query(true)
        .reply(200, { workflow_runs: [run] });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/950/jobs')
        .query(true)
        .reply(200, { jobs: [{ id: 1, name: 'E2E Tests (Shard 1 of 1)', conclusion: 'success', started_at: '2025-01-15T10:00:00Z', completed_at: '2025-01-15T10:05:00Z' }] });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/950/artifacts')
        .query(true)
        .reply(200, { artifacts: [{ id: 950, name: 'allure-results-shard-1', size_in_bytes: 500, expired: false }] });

      // 5 parametrized invocations of the same test method: same `name`,
      // same `testRailId` (TmsLink → C9999), distinct `historyId` per
      // variant (Allure derives historyId from `fullName + parameters`).
      const shardZip = makeAllureResultZip([
        { name: 'paymentTest', historyId: 'h-pay-1', status: 'passed', testRailId: 'C9999', parameters: [{ name: 'amount', value: '$10' }] },
        { name: 'paymentTest', historyId: 'h-pay-2', status: 'passed', testRailId: 'C9999', parameters: [{ name: 'amount', value: '$20' }] },
        { name: 'paymentTest', historyId: 'h-pay-3', status: 'passed', testRailId: 'C9999', parameters: [{ name: 'amount', value: '$30' }] },
        { name: 'paymentTest', historyId: 'h-pay-4', status: 'passed', testRailId: 'C9999', parameters: [{ name: 'amount', value: '$40' }] },
        { name: 'paymentTest', historyId: 'h-pay-5', status: 'failed', testRailId: 'C9999', parameters: [{ name: 'amount', value: '$50' }] },
      ]);
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/artifacts/950/zip')
        .reply(200, shardZip, { 'Content-Type': 'application/zip' });

      const out = await connector.fetchTestRuns!(makeAllureConfig());
      expect(out).toHaveLength(1);
      // Five distinct variants → five results (was previously 1 in the
      // old code because they all shared TmsLink C9999).
      expect(out[0].results).toHaveLength(5);
      // testExternalId should still be the TestRail ID for every variant
      // so they all link to the same TestRail test_case in syncTestRuns.
      expect(out[0].results.every((r) => r.testExternalId === '9999')).toBe(true);
      // Statuses preserved per variant.
      const passed = out[0].results.filter((r) => r.status === 'PASSED');
      const failed = out[0].results.filter((r) => r.status === 'FAILED');
      expect(passed).toHaveLength(4);
      expect(failed).toHaveLength(1);
    });

    it('falls back to (testRailId, fullName, parameters) when historyId is absent', async () => {
      // Defensive: real Allure always emits historyId, but when it's missing
      // (e.g. older Allure version, custom adapter) we should still keep
      // parametrized variants distinct using fullName + parameters.
      const run = mockWorkflowRun({ id: 951, run_number: 951, status: 'completed', conclusion: 'success', head_branch: 'develop' });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/workflows/e2e.yml/runs')
        .query(true)
        .reply(200, { workflow_runs: [run] });
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/951/jobs')
        .query(true)
        .reply(200, { jobs: [{ id: 1, name: 'E2E Tests (Shard 1 of 1)', conclusion: 'success', started_at: '2025-01-15T10:00:00Z', completed_at: '2025-01-15T10:05:00Z' }] });
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/951/artifacts')
        .query(true)
        .reply(200, { artifacts: [{ id: 951, name: 'allure-results-shard-1', size_in_bytes: 500, expired: false }] });

      const shardZip = makeAllureZipRaw([
        { uuid: 'a', name: 'paramTest', fullName: 'pkg.ParamTest.paramTest', status: 'passed',
          parameters: [{ name: 'value', value: '1' }],
          labels: [{ name: 'tag', value: 'C100' }],
          start: 1700000000000, stop: 1700000005000 },
        { uuid: 'b', name: 'paramTest', fullName: 'pkg.ParamTest.paramTest', status: 'passed',
          parameters: [{ name: 'value', value: '2' }],
          labels: [{ name: 'tag', value: 'C100' }],
          start: 1700000000000, stop: 1700000005000 },
        // True retry of variant 1 — same fullName + same parameters → group together.
        { uuid: 'c', name: 'paramTest', fullName: 'pkg.ParamTest.paramTest', status: 'failed',
          parameters: [{ name: 'value', value: '1' }],
          labels: [{ name: 'tag', value: 'C100' }],
          start: 1700000010000, stop: 1700000015000 },
      ]);
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/artifacts/951/zip')
        .reply(200, shardZip, { 'Content-Type': 'application/zip' });

      const out = await connector.fetchTestRuns!(makeAllureConfig());
      expect(out).toHaveLength(1);
      // 2 distinct variants. Variant 1 has 2 attempts (passed then failed)
      // → FLAKY. Variant 2 has 1 passing attempt → PASSED.
      expect(out[0].results).toHaveLength(2);
      const flakyCount = out[0].results.filter((r) => r.status === 'FLAKY').length;
      const passedCount = out[0].results.filter((r) => r.status === 'PASSED').length;
      expect(flakyCount).toBe(1);
      expect(passedCount).toBe(1);
    });

    it('counts expired-only runs separately from artifact pattern mismatches', async () => {
      // Codex review on `221a67e`: a run whose artifacts are ALL expired
      // hits the same `matchingArtifacts.length === 0` branch as an
      // unmatched-name run, but the user can't fix expired artifacts via
      // `artifactPattern`. Track it separately so SyncService can warn that
      // the selected workflow may be stale or artifact retention is too
      // short, without telling the user to change artifactPattern.
      const run = mockWorkflowRun({ id: 952, run_number: 952, status: 'completed', conclusion: 'success', head_branch: 'develop' });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/workflows/e2e.yml/runs')
        .query(true)
        .reply(200, { workflow_runs: [run] });
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/952/jobs')
        .query(true)
        .reply(200, { jobs: [] });
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/952/artifacts')
        .query(true)
        .reply(200, {
          artifacts: [
            { id: 9520, name: 'allure-results-shard-1', size_in_bytes: 500, expired: true },
            { id: 9521, name: 'allure-results-shard-2', size_in_bytes: 500, expired: true },
          ],
        });

      await connector.fetchTestRuns!(makeAllureConfig());
      const diag = (connector as any).getDiagnostics();
      expect(diag.completedRuns).toBe(1);
      // Expired-only runs should not contribute to the pattern/content
      // counters, but they should have their own actionable diagnostic.
      expect(diag.runsWithoutMatchedArtifacts).toBe(0);
      expect(diag.runsWithoutParsedResults).toBe(0);
      expect(diag.runsWithExpiredOnlyArtifacts).toBe(1);
      expect(diag.sampleExpiredArtifactNames).toEqual([
        'allure-results-shard-1',
        'allure-results-shard-2',
      ]);
    });

    it('counts artifact-download failures distinctly from matched-but-empty (Codex review)', async () => {
      // Codex review on `5336fc6`: when every matching artifact returns an
      // HTTP error (auth/scope issue), the previous code caught each
      // failure per-artifact, allResults stayed empty, and the run was
      // counted as `runsWithoutParsedResults` ("upload raw Allure" advice)
      // instead of `runsWithDownloadFailures` ("fix token scope" advice).
      // The two counters must stay separate so the SyncService warning
      // can give the right guidance.
      const run = mockWorkflowRun({
        id: 4030, run_number: 4030, status: 'completed', conclusion: 'success', head_branch: 'develop',
      });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/workflows/e2e.yml/runs')
        .query(true)
        .reply(200, { workflow_runs: [run] });
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/4030/jobs')
        .query(true)
        .reply(200, {
          jobs: [{ id: 1, name: 'E2E Tests (Shard 1 of 1)', conclusion: 'success', started_at: '2025-01-15T10:00:00Z', completed_at: '2025-01-15T10:05:00Z' }],
        });
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/4030/artifacts')
        .query(true)
        .reply(200, {
          artifacts: [
            { id: 40300, name: 'allure-results-shard-1', size_in_bytes: 500, expired: false },
          ],
        });
      // Simulate `actions:read` scope missing → 403 on the zip endpoint.
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/artifacts/40300/zip')
        .reply(403, { message: 'Forbidden' });

      await connector.fetchTestRuns!(makeAllureConfig());
      const diag = (connector as any).getDiagnostics();
      expect(diag.completedRuns).toBe(1);
      // Critical assertion: the counter is download-failure, NOT
      // matched-but-empty. SyncService routes the user to the correct
      // remediation based on this distinction.
      expect(diag.runsWithDownloadFailures).toBe(1);
      expect(diag.runsWithoutParsedResults).toBe(0);
      expect(diag.runsWithoutMatchedArtifacts).toBe(0);
      // Sample includes the HTTP status text so the SyncService warning
      // can quote it back to the user.
      expect(diag.sampleDownloadErrors.some((s: string) => s.includes('403'))).toBe(true);
    });

    it('keeps name-mismatch and matched-but-empty diagnostics counters separate', async () => {
      // Codex review: previously a single `runsWithoutMatchedArtifacts`
      // counter incremented on BOTH conditions, so the SyncService warning
      // text "did not match the connector pattern" lied for matched-but-
      // empty cases. The diagnostics now expose both signals separately.
      //
      // Mixed scenario: 1 run with unmatched artifact name (custom-e2e),
      // 1 run with a matched artifact whose zip contains nothing parseable.
      const runUnmatched = mockWorkflowRun({ id: 940, run_number: 940, status: 'completed', conclusion: 'success', head_branch: 'develop' });
      const runMatchedEmpty = mockWorkflowRun({ id: 941, run_number: 941, status: 'completed', conclusion: 'success', head_branch: 'develop' });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/workflows/e2e.yml/runs')
        .query(true)
        .reply(200, { workflow_runs: [runUnmatched, runMatchedEmpty] });

      for (const id of [940, 941]) {
        nock(GITHUB_API)
          .get(`/repos/my-org/my-repo/actions/runs/${id}/jobs`)
          .query(true)
          .reply(200, { jobs: [{ id: 1, name: 'E2E Tests (Shard 1 of 1)', conclusion: 'success', started_at: '2025-01-15T10:00:00Z', completed_at: '2025-01-15T10:05:00Z' }] });
      }

      // Run 940: artifact name doesn't match anything → name-mismatch.
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/940/artifacts')
        .query(true)
        .reply(200, { artifacts: [{ id: 940, name: 'custom-e2e-results', size_in_bytes: 500, expired: false }] });

      // Run 941: name matches the strict shard pattern, but the zip is empty
      // (no *-result.json files and no data/test-cases/*.json) → parsed 0.
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/941/artifacts')
        .query(true)
        .reply(200, { artifacts: [{ id: 941, name: 'allure-results-shard-1', size_in_bytes: 100, expired: false }] });
      const emptyZip = new AdmZip();
      emptyZip.addFile('readme.txt', Buffer.from('not allure data'));
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/artifacts/941/zip')
        .reply(200, emptyZip.toBuffer(), { 'Content-Type': 'application/zip' });

      const out = await connector.fetchTestRuns!(makeAllureConfig());
      expect(out).toHaveLength(2);
      // Both runs end up with shard-fallback counts (CI_JOBS), but the
      // diagnostics counters must distinguish *why*.
      for (const r of out) expect(r.countSource).toBe('CI_JOBS');

      const diag = (connector as any).getDiagnostics();
      expect(diag.completedRuns).toBe(2);
      expect(diag.runsWithoutMatchedArtifacts).toBe(1);
      expect(diag.runsWithoutParsedResults).toBe(1);
      // Only the unmatched run contributed to seenUnmatched.
      expect(diag.sampleUnmatchedArtifactNames).toContain('custom-e2e-results');
      expect(diag.sampleUnmatchedArtifactNames).not.toContain('allure-results-shard-1');
    });

    it('maps GitHub conclusion to the correct test-run status', async () => {
      // skipped (path-skipped workflow) and neutral (custom action's
      // "neither success nor failure") must NOT map to PASSED — that would
      // inflate getPassRateTrend.passedRuns. They map to CANCELLED so they
      // count as unhealthy in Run Health and stay out of pass-rate analytics.
      const cancelledRun = mockWorkflowRun({ id: 81, status: 'completed', conclusion: 'cancelled', head_branch: 'develop' });
      const timedOutRun = mockWorkflowRun({ id: 82, status: 'completed', conclusion: 'timed_out', head_branch: 'develop' });
      const skippedRun = mockWorkflowRun({ id: 83, status: 'completed', conclusion: 'skipped', head_branch: 'develop' });
      const neutralRun = mockWorkflowRun({ id: 84, status: 'completed', conclusion: 'neutral', head_branch: 'develop' });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/workflows/e2e.yml/runs')
        .query(true)
        .reply(200, { workflow_runs: [cancelledRun, timedOutRun, skippedRun, neutralRun] });

      for (const id of [81, 82, 83, 84]) {
        nock(GITHUB_API)
          .get(`/repos/my-org/my-repo/actions/runs/${id}/jobs`)
          .query(true)
          .reply(200, { jobs: [] });
        nock(GITHUB_API)
          .get(`/repos/my-org/my-repo/actions/runs/${id}/artifacts`)
          .query(true)
          .reply(200, { artifacts: [] });
      }

      const config = makeConfig({
        credentials: {
          token: 'ghp_testtoken123',
          owner: 'my-org',
          repo: 'my-repo',
          workflowFile: 'e2e.yml',
          branch: 'develop',
          maxRuns: 4,
        },
      });
      const results = await connector.fetchTestRuns!(config);
      const byId = (id: string) => results.find((r) => r.externalId === id);
      expect(byId('gh-81')?.status).toBe('CANCELLED');
      expect(byId('gh-82')?.status).toBe('ERRORED');
      expect(byId('gh-83')?.status).toBe('CANCELLED');
      expect(byId('gh-84')?.status).toBe('CANCELLED');
    });

    it('downloads all shard artifacts and parses allure results', async () => {
      const run = mockWorkflowRun({
        id: 999,
        run_number: 42,
        status: 'completed',
        conclusion: 'failure',
        head_branch: 'develop',
      });

      // List workflow runs for branch
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/workflows/e2e.yml/runs')
        .query({ branch: 'develop', status: 'completed', per_page: '2', page: '1' })
        .reply(200, { workflow_runs: [run] });

      // Jobs: shard 1 failed, shard 2 passed
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/999/jobs')
        .query(true)
        .reply(200, {
          jobs: [
            { id: 1, name: 'E2E Tests (Shard 1 of 2)', conclusion: 'failure', started_at: '2025-01-15T10:00:00Z', completed_at: '2025-01-15T10:05:00Z' },
            { id: 2, name: 'E2E Tests (Shard 2 of 2)', conclusion: 'success', started_at: '2025-01-15T10:00:00Z', completed_at: '2025-01-15T10:04:00Z' },
          ],
        });

      // Artifacts
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/999/artifacts')
        .query(true)
        .reply(200, {
          artifacts: [
            { id: 10, name: 'allure-results-shard-1', size_in_bytes: 1000, expired: false },
            { id: 11, name: 'allure-results-shard-2', size_in_bytes: 900, expired: false },
          ],
        });

      // Download both shards
      const shard1Zip = makeAllureResultZip([
        { name: 'Login Test', status: 'passed', testRailId: 'C1001' },
        { name: 'Payment Test', status: 'failed', testRailId: 'C1002' },
        { name: 'No mapping test', status: 'passed' }, // no TestRailId
      ]);

      const shard2Zip = makeAllureResultZip([
        { name: 'Profile Test', status: 'passed', testRailId: 'C1003' },
      ]);

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/artifacts/10/zip')
        .reply(200, shard1Zip, { 'Content-Type': 'application/zip' });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/artifacts/11/zip')
        .reply(200, shard2Zip, { 'Content-Type': 'application/zip' });

      const results = await connector.fetchTestRuns!(makeAllureConfig());

      expect(results).toHaveLength(1);
      const testRun = results[0];
      expect(testRun.externalId).toBe('gh-999');
      expect(testRun.branch).toBe('develop');
      expect(testRun.status).toBe('FAILED');
      // 4 results total from both shards (tests without TestRailId get a generated ID from name)
      expect(testRun.results).toHaveLength(4);
      const byId = (id: string) => testRun.results.find(r => r.testExternalId === id);
      expect(byId('1001')?.status).toBe('PASSED');
      expect(byId('1002')?.status).toBe('FAILED');
      expect(byId('1002')?.errorMessage).toBe('Assertion failed');
      expect(byId('1003')?.status).toBe('PASSED');
      // The test without TestRailId gets a generated ID from its name
      const noMapping = testRun.results.find(r => r.testTitle === 'No mapping test');
      expect(noMapping).toBeDefined();
      expect(noMapping!.testExternalId).toBe('No_mapping_test');
      expect(noMapping!.status).toBe('PASSED');
    });

    it('downloads all shards even when all passed', async () => {
      const run = mockWorkflowRun({
        id: 888,
        run_number: 41,
        status: 'completed',
        conclusion: 'success',
        head_branch: 'develop',
      });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/workflows/e2e.yml/runs')
        .query(true)
        .reply(200, { workflow_runs: [run] });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/888/jobs')
        .query(true)
        .reply(200, {
          jobs: [
            { id: 1, name: 'E2E Tests (Shard 1 of 2)', conclusion: 'success', started_at: '2025-01-15T10:00:00Z', completed_at: '2025-01-15T10:05:00Z' },
            { id: 2, name: 'E2E Tests (Shard 2 of 2)', conclusion: 'success', started_at: '2025-01-15T10:00:00Z', completed_at: '2025-01-15T10:04:00Z' },
          ],
        });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/888/artifacts')
        .query(true)
        .reply(200, {
          artifacts: [
            { id: 20, name: 'allure-results-shard-1', size_in_bytes: 800, expired: false },
            { id: 21, name: 'allure-results-shard-2', size_in_bytes: 700, expired: false },
          ],
        });

      const shard1Zip = makeAllureResultZip([
        { name: 'Test A', status: 'passed', testRailId: 'C2001' },
      ]);
      const shard2Zip = makeAllureResultZip([
        { name: 'Test B', status: 'passed', testRailId: 'C2002' },
      ]);

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/artifacts/20/zip')
        .reply(200, shard1Zip, { 'Content-Type': 'application/zip' });
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/artifacts/21/zip')
        .reply(200, shard2Zip, { 'Content-Type': 'application/zip' });

      const results = await connector.fetchTestRuns!(makeAllureConfig());
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('PASSED');
      expect(results[0].results).toHaveLength(2);
    });

    it('marks retry-disagreement as FLAKY and keeps stable retries as PASSED/FAILED', async () => {
      const run = mockWorkflowRun({
        id: 777,
        run_number: 40,
        status: 'completed',
        conclusion: 'success',
        head_branch: 'develop',
      });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/workflows/e2e.yml/runs')
        .query(true)
        .reply(200, { workflow_runs: [run] });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/777/jobs')
        .query(true)
        .reply(200, {
          jobs: [
            { id: 1, name: 'E2E Tests (Shard 1 of 1)', conclusion: 'success', started_at: '2025-01-15T10:00:00Z', completed_at: '2025-01-15T10:05:00Z' },
          ],
        });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/777/artifacts')
        .query(true)
        .reply(200, {
          artifacts: [
            { id: 30, name: 'allure-results-shard-1', size_in_bytes: 500, expired: false },
          ],
        });

      // Real Allure retries: same `historyId` and `name` for each attempt
      // (Allure 2's @TestCaseId / @AllureRetry mechanism reuses the test
      // definition across retries). Different `start` times so retryIndex
      // is stable.
      const shardZip = makeAllureResultZip([
        { name: 'Loan Test', historyId: 'h-loan', status: 'failed', testRailId: 'C5001', start: 1700000000000, stop: 1700000005000 },
        { name: 'Loan Test', historyId: 'h-loan', status: 'passed', testRailId: 'C5001', start: 1700000010000, stop: 1700000015000 },
        { name: 'Payment Test', historyId: 'h-pay', status: 'failed', testRailId: 'C5002', start: 1700000000000, stop: 1700000005000 },
        { name: 'Payment Test', historyId: 'h-pay', status: 'failed', testRailId: 'C5002', start: 1700000010000, stop: 1700000015000 },
      ]);

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/artifacts/30/zip')
        .reply(200, shardZip, { 'Content-Type': 'application/zip' });

      const results = await connector.fetchTestRuns!(makeAllureConfig());
      expect(results).toHaveLength(1);
      // 2 unique tests, not 4
      expect(results[0].results).toHaveLength(2);
      // C5001: failed then passed → within-run retry disagreement = FLAKY.
      // (Previously this collapsed to PASSED and hid the flakiness signal.)
      const test5001 = results[0].results.find((r) => r.testExternalId === '5001');
      expect(test5001?.status).toBe('FLAKY');
      // C5002: both attempts failed → still FAILED.
      const test5002 = results[0].results.find((r) => r.testExternalId === '5002');
      expect(test5002?.status).toBe('FAILED');
    });

    it('strips non-digit prefixes (ASCII C, Cyrillic С, double CC) from TestRailId', async () => {
      const run = mockWorkflowRun({ id: 888, run_number: 10, status: 'completed', conclusion: 'success', head_branch: 'develop' });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/workflows/e2e.yml/runs')
        .query(true)
        .reply(200, { workflow_runs: [run] });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/888/jobs')
        .query(true)
        .reply(200, {
          jobs: [{ id: 1, name: 'E2E Tests (Shard 1 of 1)', conclusion: 'success', started_at: '2025-01-15T10:00:00Z', completed_at: '2025-01-15T10:05:00Z' }],
        });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/888/artifacts')
        .query(true)
        .reply(200, { artifacts: [{ id: 40, name: 'allure-results-shard-1', size_in_bytes: 500, expired: false }] });

      // Various non-digit prefixes — all should be stripped to numeric ID
      const shardZip = makeAllureResultZip([
        { name: 'Loan Test', status: 'passed', testRailId: 'CC3952' },
        { name: 'Interest Test', status: 'passed', testRailId: '\u04213942' }, // Cyrillic С
      ]);

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/artifacts/40/zip')
        .reply(200, shardZip, { 'Content-Type': 'application/zip' });

      const results = await connector.fetchTestRuns!(makeAllureConfig());
      expect(results[0].results).toHaveLength(2);
      // CC3952 → 3952 (ASCII double-C stripped)
      const t3952 = results[0].results.find(r => r.testExternalId === '3952');
      expect(t3952).toBeDefined();
      // С3942 (Cyrillic С U+0421) → 3942
      const t3942 = results[0].results.find(r => r.testExternalId === '3942');
      expect(t3942).toBeDefined();
    });

    it('extracts TestRailId from non-`TestRailId:` Allure conventions (tms / links / name)', async () => {
      // Real-world Allure outputs vary. Repos that use @TmsLink, @AllureId, or
      // just put the TestRail ID in the test name need to link to existing
      // TestRail-defined test cases instead of getting a separate
      // github-source auto-created test case (which is why the per-test-case
      // history was missing GitHub runs for the user's `develop` branch).
      const run = mockWorkflowRun({ id: 901, run_number: 90, status: 'completed', conclusion: 'success', head_branch: 'develop' });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/workflows/e2e.yml/runs')
        .query(true)
        .reply(200, { workflow_runs: [run] });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/901/jobs')
        .query(true)
        .reply(200, {
          jobs: [{ id: 1, name: 'E2E Tests (Shard 1 of 1)', conclusion: 'success', started_at: '2025-01-15T10:00:00Z', completed_at: '2025-01-15T10:05:00Z' }],
        });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/901/artifacts')
        .query(true)
        .reply(200, { artifacts: [{ id: 901, name: 'allure-results-shard-1', size_in_bytes: 500, expired: false }] });

      const zip = makeAllureZipRaw([
        // tms label (Allure's @TmsLink lands here as `name: 'tms'`)
        { uuid: 'a', name: 'Verify accrual activity 1', status: 'passed', start: 1, stop: 2,
          labels: [{ name: 'tms', value: 'C4570' }] },
        // bare-tag without 'TestRailId:' prefix
        { uuid: 'b', name: 'Verify accrual activity 2', status: 'passed', start: 1, stop: 2,
          labels: [{ name: 'tag', value: 'C4571' }] },
        // links[] of type tms
        { uuid: 'c', name: 'Verify accrual activity 3', status: 'passed', start: 1, stop: 2,
          links: [{ type: 'tms', name: 'C4572', url: 'https://testrail/cases/4572' }] },
        // links[] of type tms — only URL has the ID
        { uuid: 'd', name: 'Verify accrual activity 4', status: 'passed', start: 1, stop: 2,
          links: [{ type: 'tms', url: 'https://testrail.example/cases/C4573' }] },
        // ID embedded in test name as a stand-alone token (last-resort)
        { uuid: 'e', name: 'C4574: Verify accrual activity 5', status: 'passed', start: 1, stop: 2 },
        // as_id label — Allure's @AllureId lands here as raw numeric
        { uuid: 'f', name: 'Verify accrual activity 6', status: 'passed', start: 1, stop: 2,
          labels: [{ name: 'as_id', value: '4575' }] },
      ]);
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/artifacts/901/zip')
        .reply(200, zip, { 'Content-Type': 'application/zip' });

      const out = await connector.fetchTestRuns!(makeAllureConfig());
      expect(out).toHaveLength(1);
      const ids = new Set(out[0].results.map((r) => r.testExternalId));
      // 4570..4575 should all be extracted as numeric IDs that match TestRail
      expect(ids.has('4570')).toBe(true);
      expect(ids.has('4571')).toBe(true);
      expect(ids.has('4572')).toBe(true);
      expect(ids.has('4573')).toBe(true);
      expect(ids.has('4574')).toBe(true);
      expect(ids.has('4575')).toBe(true);
    });

    it('does not match arbitrary tokens that look like TestRail IDs', async () => {
      // Don't extract from substrings inside other identifiers ("PC1234"),
      // and don't match short numeric tags that are likely sprint IDs etc.
      const run = mockWorkflowRun({ id: 902, run_number: 91, status: 'completed', conclusion: 'success', head_branch: 'develop' });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/workflows/e2e.yml/runs')
        .query(true)
        .reply(200, { workflow_runs: [run] });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/902/jobs')
        .query(true)
        .reply(200, {
          jobs: [{ id: 1, name: 'E2E Tests (Shard 1 of 1)', conclusion: 'success', started_at: '2025-01-15T10:00:00Z', completed_at: '2025-01-15T10:05:00Z' }],
        });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/902/artifacts')
        .query(true)
        .reply(200, { artifacts: [{ id: 902, name: 'allure-results-shard-1', size_in_bytes: 500, expired: false }] });

      const zip = makeAllureZipRaw([
        // Embedded inside another identifier — should NOT match
        { uuid: 'x', name: 'PC1234 should not match', status: 'passed', start: 1, stop: 2 },
        // 2-digit number after C — too short for our pattern, should NOT match
        { uuid: 'y', name: 'C12 short id', status: 'passed', start: 1, stop: 2 },
      ]);
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/artifacts/902/zip')
        .reply(200, zip, { 'Content-Type': 'application/zip' });

      const out = await connector.fetchTestRuns!(makeAllureConfig());
      // Both fall back to generated IDs (no testRailId extracted)
      expect(out[0].results.find((r) => r.testExternalId === '1234')).toBeUndefined();
      expect(out[0].results.find((r) => r.testExternalId === '12')).toBeUndefined();
    });

    it('rejects bare numeric tags and JIRA-style tokens (no false-positive linkage)', async () => {
      // Codex flagged that the previous extraction was too permissive — a
      // generic `tag` like `2026` (sprint/year tag) or a `tms` URL ending in
      // `JIRA-456` could have been promoted to TestRail IDs and link a
      // GitHub run to the wrong TestRail case. The tightened rules require
      // an explicit `C`/`CC`/Cyrillic-`С` prefix on generic tags and the
      // name fallback, and reject non-numeric values on ID-typed fields.
      const run = mockWorkflowRun({ id: 903, run_number: 92, status: 'completed', conclusion: 'success', head_branch: 'develop' });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/workflows/e2e.yml/runs')
        .query(true)
        .reply(200, { workflow_runs: [run] });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/903/jobs')
        .query(true)
        .reply(200, {
          jobs: [{ id: 1, name: 'E2E Tests (Shard 1 of 1)', conclusion: 'success', started_at: '2025-01-15T10:00:00Z', completed_at: '2025-01-15T10:05:00Z' }],
        });

      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/runs/903/artifacts')
        .query(true)
        .reply(200, { artifacts: [{ id: 903, name: 'allure-results-shard-1', size_in_bytes: 500, expired: false }] });

      const zip = makeAllureZipRaw([
        // Bare numeric tag — must NOT be treated as a TestRail ID.
        { uuid: 'a', name: 'Sprint year tag', status: 'passed', start: 1, stop: 2,
          labels: [{ name: 'tag', value: '2026' }] },
        // links[type=tms] pointing at a JIRA URL — non-numeric tail, must NOT match.
        { uuid: 'b', name: 'Jira-tracked test', status: 'passed', start: 1, stop: 2,
          links: [{ type: 'tms', url: 'https://jira.example/browse/JIRA-456' }] },
        // links[type=tms] with non-numeric `name` — must NOT match.
        { uuid: 'c', name: 'Bad tms name', status: 'passed', start: 1, stop: 2,
          links: [{ type: 'tms', name: 'JIRA-789' }] },
        // Bare `tag` value with `C` prefix — SHOULD still match (positive control).
        { uuid: 'd', name: 'TestRail-prefixed tag', status: 'passed', start: 1, stop: 2,
          labels: [{ name: 'tag', value: 'C7777' }] },
      ]);
      nock(GITHUB_API)
        .get('/repos/my-org/my-repo/actions/artifacts/903/zip')
        .reply(200, zip, { 'Content-Type': 'application/zip' });

      const out = await connector.fetchTestRuns!(makeAllureConfig());
      const ids = new Set(out[0].results.map((r) => r.testExternalId));
      // Negative cases — none of these should produce numeric TestRail IDs.
      expect(ids.has('2026')).toBe(false);
      expect(ids.has('456')).toBe(false);
      expect(ids.has('789')).toBe(false);
      // Positive control — the C-prefixed tag still extracts correctly.
      expect(ids.has('7777')).toBe(true);
    });
  });

  // ──────────────── Rate limiting ────────────────

  describe('rate limiting', () => {
    it('throws when rate limit is exhausted', async () => {
      nock(GITHUB_API)
        .get('/user')
        .reply(200, mockUser, {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 60),
        });

      await expect(connector.authenticate(makeConfig())).rejects.toThrow(/rate limit/i);
    });
  });

  // ──────────────── onWebhookEvent ────────────────

  describe('onWebhookEvent', () => {
    it('processes workflow_run completed event', async () => {
      const payload = {
        action: 'completed',
        workflow_run: mockWorkflowRun(),
      };

      const headers = {
        'x-github-event': 'workflow_run',
        'x-github-delivery': 'delivery-123',
      };

      // Should not throw
      await expect(
        connector.onWebhookEvent!(payload, headers),
      ).resolves.not.toThrow();
    });

    it('ignores non-workflow_run events', async () => {
      const payload = { action: 'opened' };
      const headers = {
        'x-github-event': 'pull_request',
        'x-github-delivery': 'delivery-456',
      };

      await expect(
        connector.onWebhookEvent!(payload, headers),
      ).resolves.not.toThrow();
    });
  });
});
