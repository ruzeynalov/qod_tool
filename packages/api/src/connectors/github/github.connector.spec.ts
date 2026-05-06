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

    function makeAllureResultZip(results: Array<{ name: string; status: string; testRailId?: string }>): Buffer {
      const zip = new AdmZip();
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const json = {
          uuid: `uuid-${i}`,
          name: r.name,
          status: r.status,
          statusDetails: r.status === 'failed' ? { message: 'Assertion failed', trace: 'at Test.java:42' } : {},
          labels: r.testRailId ? [{ name: 'tag', value: `TestRailId:${r.testRailId}` }] : [],
          start: 1700000000000,
          stop: 1700000005000,
        };
        // Simulate real structure: files inside allure-results-merged/
        zip.addFile(`allure-results-merged/${r.name.replace(/\s/g, '_')}-result.json`, Buffer.from(JSON.stringify(json)));
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

      // Same TestRailId appears twice (retry): first failed, then passed
      const shardZip = makeAllureResultZip([
        { name: 'Loan Test', status: 'failed', testRailId: 'C5001' },
        { name: 'Loan Test retry', status: 'passed', testRailId: 'C5001' },
        { name: 'Payment Test', status: 'failed', testRailId: 'C5002' },
        { name: 'Payment Test retry', status: 'failed', testRailId: 'C5002' },
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
