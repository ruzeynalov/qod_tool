import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { Logger } from '@nestjs/common';
import AdmZip from 'adm-zip';
import type {
  IQODConnector,
  ConnectorConfig,
  ConnectorCategory,
  AuthResult,
  NormalizedPipelineRun,
  NormalizedTestRun,
  NormalizedTestResult,
  PipelineJob,
  PipelineStep,
} from '@qod/shared';

const GITHUB_API_BASE = 'https://api.github.com';

interface GitHubCredentials {
  token: string;
  owner: string;
  repo: string;
  workflowFile?: string;
  branch?: string;
  maxRuns?: number;
  artifactPattern?: string;
}

type PipelineStatus = NormalizedPipelineRun['status'];

export class GitHubConnector implements IQODConnector {
  private readonly logger = new Logger(GitHubConnector.name);
  readonly name = 'github';
  readonly type: ConnectorCategory = 'ci';

  // ──────────────── Auth ────────────────

  async authenticate(config: ConnectorConfig): Promise<AuthResult> {
    const { token } = this.extractCredentials(config);
    const response = await this.request('/user', token);

    this.checkRateLimit(response);

    if (response.status === 200) {
      const user = await response.json() as { login: string; name: string };
      return { success: true, metadata: { login: user.login, name: user.name } };
    }

    const body = await response.json() as { message?: string };
    return { success: false, error: body.message ?? `Authentication failed (${response.status})` };
  }

  async testConnection(config: ConnectorConfig): Promise<AuthResult> {
    return this.authenticate(config);
  }

  // ──────────────── Pipeline Runs ────────────────

  async fetchPipelineRuns(config: ConnectorConfig, _since?: Date): Promise<NormalizedPipelineRun[]> {
    const creds = this.extractCredentials(config);
    const maxRuns = creds.maxRuns || 10;
    // Always fetch the N most recent runs (maxRuns controls the window).
    // Don't use `since` — it would prevent fetching older runs when maxRuns is increased.
    // Idempotent upserts in SyncService handle deduplication.
    const allRuns = await this.fetchRecentWorkflowRuns(creds, maxRuns);

    const pipelineRuns: NormalizedPipelineRun[] = [];

    for (const run of allRuns) {
      const jobs = await this.fetchJobsForRun(creds, run.id);
      pipelineRuns.push(this.mapWorkflowRun(run, jobs));
    }

    return pipelineRuns;
  }

  // ──────────────── Test Runs (Allure Artifacts) ────────────────

  async fetchTestRuns(config: ConnectorConfig, _since?: Date): Promise<NormalizedTestRun[]> {
    const creds = this.extractCredentials(config);
    const branch = creds.branch || 'main';
    const maxRuns = creds.maxRuns || 10;

    // 1. Fetch recent completed workflow runs.
    // When workflowFile is configured, scope to that workflow + branch + completed.
    // Otherwise fall back to all workflows for the branch — failed/setup-only runs
    // still need to populate test_runs so Run Health, Daily Run Results, and Run
    // History reflect them. We request `status: 'completed'` from GitHub on the
    // fallback path too: otherwise queued/in-progress runs would consume slots
    // in the maxRuns page and we'd silently skip completed runs that fell off
    // the first page. (Don't use `since` — maxRuns controls the fetch window.)
    const runs = creds.workflowFile
      ? await this.fetchBranchWorkflowRuns(creds, branch, maxRuns)
      : await this.fetchRecentWorkflowRuns(creds, maxRuns, undefined, branch, 'completed');
    const testRuns: NormalizedTestRun[] = [];

    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      if (run.status !== 'completed') continue;

      this.logger.log(`Processing run ${i + 1}/${runs.length}: #${run.run_number} (id: ${run.id})`);

      // 2. Get jobs — prefer shard jobs, fall back to all jobs
      const jobs = await this.fetchJobsForRun(creds, run.id);
      const shardJobs = jobs.filter((j) => /shard/i.test(j.name));
      const relevantJobs = shardJobs.length > 0 ? shardJobs : jobs;
      if (shardJobs.length === 0) {
        this.logger.log(`  No shard jobs found, using all ${jobs.length} jobs`);
      }

      // 3. List artifacts for this run
      const artifacts = await this.fetchArtifactsForRun(creds, run.id);

      // 4. Download & parse matching artifacts
      // Use configured artifactPattern, default to Allure shard pattern, then fall back to common JUnit patterns
      const allResults: AllureResult[] = [];
      const artifactPattern = creds.artifactPattern;
      let matchingArtifacts: GitHubArtifact[];

      if (artifactPattern) {
        // User-configured pattern (supports simple wildcards: * matches any chars)
        const regex = new RegExp('^' + artifactPattern.replace(/\*/g, '.*') + '$');
        matchingArtifacts = artifacts.filter((a) => regex.test(a.name) && !a.expired);
      } else {
        // Default: try Allure shard artifacts first
        matchingArtifacts = artifacts.filter(
          (a) => /^allure-results-shard-\d+$/.test(a.name) && !a.expired,
        );
        // Fallback: look for common JUnit/test result artifact names
        if (matchingArtifacts.length === 0) {
          matchingArtifacts = artifacts.filter(
            (a) => /^(test-results|junit-results|test-report|surefire-reports)/.test(a.name) && !a.expired,
          );
        }
      }
      const expiredCount = artifacts.filter((a) => a.expired).length;
      this.logger.log(`  Found ${matchingArtifacts.length} matching artifacts (${artifacts.length} total, ${expiredCount} expired)`);

      for (const artifact of matchingArtifacts) {
        try {
          const results = await this.downloadAndParseAllureArtifact(
            creds,
            artifact.id,
          );
          allResults.push(...results);
        } catch (err) {
          this.logger.warn(`  Failed to download artifact ${artifact.id} (${artifact.name}): ${err instanceof Error ? err.message : err}`);
        }
      }

      // 5. Always emit a NormalizedTestRun for each completed workflow run,
      // even when no test results could be parsed. Failed builds (lint/setup
      // failures, expired artifacts, missing upload step) must still appear in
      // test_runs so Run Health / Daily Run Results / Run History count them.
      if (allResults.length === 0) {
        this.logger.log(`  No test results parsed — emitting run with empty results (conclusion=${run.conclusion ?? 'null'})`);
      } else {
        this.logger.log(`  Parsed ${allResults.length} Allure results`);
      }
      testRuns.push(this.mapAllureToTestRun(run, allResults, relevantJobs));
    }

    return testRuns;
  }

  // ──────────────── Webhooks ────────────────

  async onWebhookEvent(payload: unknown, headers: Record<string, string>): Promise<void> {
    const event = headers['x-github-event'];
    if (event !== 'workflow_run') {
      return;
    }

    // Process workflow_run event — in a real implementation this would
    // persist the run data or emit an internal event. For now we validate
    // and return.
    const body = payload as { action: string; workflow_run?: unknown };
    if (!body.workflow_run) {
      return;
    }
  }

  // ──────────────── Private: HTTP ────────────────

  /** Tracks the rate limit reset time from the last response. */
  private rateLimitResetAt: number | null = null;
  private rateLimitRemaining: number | null = null;

  private async request(path: string, token: string, query?: Record<string, string>): Promise<Response> {
    // Pre-check: if we know the rate limit is exhausted, wait or throw immediately
    if (this.rateLimitRemaining !== null && this.rateLimitRemaining <= 0 && this.rateLimitResetAt !== null) {
      const now = Date.now();
      const waitMs = this.rateLimitResetAt * 1000 - now;
      if (waitMs > 0 && waitMs <= 60_000) {
        // Wait up to 60 seconds for rate limit reset
        this.logger.warn(`GitHub rate limit exhausted, waiting ${Math.ceil(waitMs / 1000)}s for reset...`);
        await new Promise(resolve => setTimeout(resolve, waitMs + 1000));
      } else if (waitMs > 60_000) {
        const resetAt = new Date(this.rateLimitResetAt * 1000).toISOString();
        throw new Error(`GitHub API rate limit exhausted. Resets at ${resetAt}`);
      }
    }

    const url = new URL(path, GITHUB_API_BASE);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }
    }

    return fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
      signal: AbortSignal.timeout(30_000),
    });
  }

  private checkRateLimit(response: Response): void {
    const remaining = response.headers.get('x-ratelimit-remaining');
    const resetEpoch = response.headers.get('x-ratelimit-reset');

    if (remaining !== null) {
      this.rateLimitRemaining = parseInt(remaining, 10);
    }
    if (resetEpoch !== null) {
      this.rateLimitResetAt = parseInt(resetEpoch, 10);
    }

    if (remaining !== null && parseInt(remaining, 10) === 0) {
      const resetAt = resetEpoch ? new Date(parseInt(resetEpoch, 10) * 1000).toISOString() : 'unknown';
      throw new Error(`GitHub API rate limit exhausted. Resets at ${resetAt}`);
    }
  }

  // ──────────────── Private: Fetch runs ────────────────

  /** Fetch up to maxRuns recent workflow runs, optionally filtered by since date, branch, and run status. */
  private async fetchRecentWorkflowRuns(
    creds: GitHubCredentials,
    maxRuns: number,
    since?: Date,
    branch?: string,
    status?: string,
  ): Promise<GitHubWorkflowRun[]> {
    const basePath = creds.workflowFile
      ? `/repos/${creds.owner}/${creds.repo}/actions/workflows/${creds.workflowFile}/runs`
      : `/repos/${creds.owner}/${creds.repo}/actions/runs`;

    const query: Record<string, string> = {
      per_page: String(Math.min(maxRuns, 100)),
      page: '1',
    };
    if (since) {
      query.created = `>=${since.toISOString()}`;
    }
    if (branch) {
      query.branch = branch;
    }
    if (status) {
      query.status = status;
    }

    this.logger.log(`Fetching workflow runs: ${basePath} query=${JSON.stringify(query)}`);
    const response = await this.request(basePath, creds.token, query);
    this.checkRateLimit(response);

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`GitHub API error ${response.status}: ${body.slice(0, 500)}`);
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { workflow_runs: GitHubWorkflowRun[]; total_count?: number };
    this.logger.log(`GitHub returned ${data.total_count ?? '?'} total, ${data.workflow_runs.length} in page`);
    return data.workflow_runs.slice(0, maxRuns);
  }

  /** Fetch the N most recent completed workflow runs for a specific branch. */
  private async fetchBranchWorkflowRuns(
    creds: GitHubCredentials,
    branch: string,
    maxRuns: number,
    since?: Date,
  ): Promise<GitHubWorkflowRun[]> {
    if (!creds.workflowFile) return [];

    const basePath = `/repos/${creds.owner}/${creds.repo}/actions/workflows/${creds.workflowFile}/runs`;
    const query: Record<string, string> = {
      branch,
      status: 'completed',
      per_page: String(Math.min(maxRuns, 100)),
      page: '1',
    };
    if (since) {
      query.created = `>=${since.toISOString()}`;
    }

    this.logger.log(`Fetching branch workflow runs: ${basePath} branch=${branch} query=${JSON.stringify(query)}`);
    const response = await this.request(basePath, creds.token, query);
    this.checkRateLimit(response);

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`GitHub API error ${response.status} fetching branch runs: ${body.slice(0, 500)}`);
      throw new Error(`GitHub API error fetching branch runs: ${response.status}`);
    }

    const data = await response.json() as { workflow_runs: GitHubWorkflowRun[]; total_count?: number };
    this.logger.log(`Branch runs: ${data.total_count ?? '?'} total, ${data.workflow_runs.length} in page`);
    return data.workflow_runs.slice(0, maxRuns);
  }

  private async fetchJobsForRun(
    creds: GitHubCredentials,
    runId: number,
  ): Promise<GitHubJob[]> {
    const response = await this.request(
      `/repos/${creds.owner}/${creds.repo}/actions/runs/${runId}/jobs`,
      creds.token,
      { per_page: '100' },
    );

    this.checkRateLimit(response);

    if (!response.ok) {
      throw new Error(`GitHub API error fetching jobs: ${response.status}`);
    }

    const data = await response.json() as { jobs: GitHubJob[] };
    return data.jobs;
  }

  // ──────────────── Private: Artifacts ────────────────

  private async fetchArtifactsForRun(
    creds: GitHubCredentials,
    runId: number,
  ): Promise<GitHubArtifact[]> {
    const response = await this.request(
      `/repos/${creds.owner}/${creds.repo}/actions/runs/${runId}/artifacts`,
      creds.token,
      { per_page: '100' },
    );

    this.checkRateLimit(response);

    if (!response.ok) {
      throw new Error(`GitHub API error fetching artifacts: ${response.status}`);
    }

    const data = await response.json() as { artifacts: GitHubArtifact[] };
    return data.artifacts;
  }

  /** Size threshold for in-memory vs temp file processing (10 MB). */
  private static readonly ARTIFACT_MEM_LIMIT = 10 * 1024 * 1024;

  /** Timeout for downloading a single artifact (60 seconds). */
  private static readonly ARTIFACT_TIMEOUT = 60_000;

  private async downloadAndParseAllureArtifact(
    creds: GitHubCredentials,
    artifactId: number,
  ): Promise<AllureResult[]> {
    // GitHub returns a 302 redirect to a signed download URL
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GitHubConnector.ARTIFACT_TIMEOUT);

    try {
      const response = await fetch(
        `${GITHUB_API_BASE}/repos/${creds.owner}/${creds.repo}/actions/artifacts/${artifactId}/zip`,
        {
          headers: {
            Authorization: `Bearer ${creds.token}`,
            Accept: 'application/vnd.github+json',
          },
          redirect: 'follow',
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to download artifact ${artifactId}: ${response.status}`);
      }

      const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10);
      const useTempFile = contentLength > GitHubConnector.ARTIFACT_MEM_LIMIT;

      let zip: AdmZip;

      if (useTempFile && response.body) {
        // Stream large artifacts to a temp file to avoid OOM
        const tmpFile = path.join(os.tmpdir(), `qod-artifact-${artifactId}.zip`);
        try {
          const nodeStream = Readable.fromWeb(response.body as any);
          await pipeline(nodeStream, fs.createWriteStream(tmpFile));
          zip = new AdmZip(tmpFile);
          const results = this.extractAllureResults(zip);
          return results;
        } finally {
          try { fs.unlinkSync(tmpFile); } catch (e) { this.logger.debug(`Failed to clean up temp file ${tmpFile}: ${e}`); }
        }
      }

      // Default: process in memory
      const arrayBuffer = await response.arrayBuffer();
      zip = new AdmZip(Buffer.from(arrayBuffer));
      return this.extractAllureResults(zip);
    } finally {
      clearTimeout(timer);
    }
  }

  private extractAllureResults(zip: AdmZip): AllureResult[] {
    const results: AllureResult[] = [];
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory || !entry.entryName.endsWith('-result.json')) continue;
      try {
        const content = entry.getData().toString('utf8');
        const parsed = JSON.parse(content) as AllureResultJson;
        results.push(this.parseAllureResult(parsed));
      } catch (error) {
        this.logger.debug(`Skipping malformed Allure entry ${entry.entryName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return results;
  }

  private parseAllureResult(json: AllureResultJson): AllureResult {
    // Extract TestRailId from tag labels (e.g., { name: "tag", value: "TestRailId:C3538" })
    let testRailId: string | undefined;
    let suiteName: string | undefined;

    for (const label of json.labels ?? []) {
      if (label.name === 'tag' && label.value?.startsWith('TestRailId:')) {
        // Extract numeric ID from "TestRailId:C3538". Strip all leading
        // non-digit chars — handles ASCII "C", Cyrillic "С" (U+0421), and
        // doubled prefixes like "CC3538".
        const rawId = label.value.substring('TestRailId:'.length);
        testRailId = rawId.replace(/^\D+/, '');
      }
      if (label.name === 'suite' && label.value) {
        suiteName = label.value;
      }
    }

    const durationMs =
      json.start && json.stop ? json.stop - json.start : undefined;

    return {
      name: json.name,
      status: this.mapAllureStatus(json.status),
      testRailId,
      suiteName,
      durationMs,
      errorMessage: json.statusDetails?.message,
      stackTrace: json.statusDetails?.trace,
    };
  }

  private mapAllureStatus(
    status: string,
  ): 'PASSED' | 'FAILED' | 'SKIPPED' | 'ERROR' {
    switch (status) {
      case 'passed':
        return 'PASSED';
      case 'failed':
        return 'FAILED';
      case 'broken':
        return 'ERROR';
      case 'skipped':
        return 'SKIPPED';
      default:
        return 'FAILED';
    }
  }

  /** Extract shard number from job name like "E2E Tests (Shard 3 of 10)" */
  private extractShardNumber(jobName: string): number | null {
    const match = jobName.match(/shard\s+(\d+)/i);
    return match ? parseInt(match[1], 10) : null;
  }

  // ──────────────── Private: Mapping ────────────────

  private mapAllureToTestRun(
    run: GitHubWorkflowRun,
    allureResults: AllureResult[],
    shardJobs: GitHubJob[],
  ): NormalizedTestRun {
    const startedAt = new Date(run.run_started_at);
    const updatedAt = new Date(run.updated_at);
    const durationMs = updatedAt.getTime() - startedAt.getTime();

    // Group retry attempts by externalId so we can detect within-run flakiness.
    // A test that flipped between PASSED and FAILED inside the same run is
    // flaky by definition; squashing it to PASSED (the previous behaviour) hid
    // the signal entirely from the Flaky Tests widget.
    const attemptsByExternalId = new Map<string, AllureResult[]>();
    for (const r of allureResults) {
      const externalId = r.testRailId || this.generateTestId(r.name, r.suiteName);
      const list = attemptsByExternalId.get(externalId);
      if (list) list.push(r);
      else attemptsByExternalId.set(externalId, [r]);
    }

    const mappedResults: NormalizedTestResult[] = [];
    for (const [externalId, attempts] of attemptsByExternalId.entries()) {
      const last = attempts[attempts.length - 1];
      const hasPassed = attempts.some((a) => a.status === 'PASSED');
      const hasFailed = attempts.some((a) => a.status === 'FAILED' || a.status === 'ERROR');

      // Within-run retry disagreement → FLAKY.  Otherwise prefer the last
      // attempt's status (final outcome), keeping the existing "retry-passed
      // means passed" behaviour for consumers that still want a single status.
      let status: NormalizedTestResult['status'];
      if (attempts.length > 1 && hasPassed && hasFailed) {
        status = 'FLAKY';
      } else if (hasPassed) {
        status = 'PASSED';
      } else {
        status = last.status;
      }

      // Surface the most informative failure (first non-passed attempt) when
      // we end up FLAKY/FAILED, so the dashboard still shows a useful trace.
      const failingAttempt = attempts.find(
        (a) => a.status === 'FAILED' || a.status === 'ERROR',
      );
      const carrier = status === 'PASSED' ? last : (failingAttempt ?? last);

      mappedResults.push({
        testExternalId: externalId,
        testTitle: carrier.name,
        testSuiteName: carrier.suiteName,
        status,
        durationMs: carrier.durationMs,
        errorMessage: carrier.errorMessage,
        stackTrace: carrier.stackTrace,
        retryIndex: Math.max(attempts.length - 1, 0),
      });
    }

    const isShardRun = shardJobs.some((j) => /shard/i.test(j.name));
    let nameSuffix: string;
    if (isShardRun) {
      const failedShardCount = shardJobs.filter(
        (j) => j.conclusion === 'failure',
      ).length;
      nameSuffix = failedShardCount > 0
        ? `(${failedShardCount} failed shard${failedShardCount !== 1 ? 's' : ''})`
        : `(${shardJobs.length} shards passed)`;
    } else {
      const failedJobCount = shardJobs.filter(
        (j) => j.conclusion === 'failure',
      ).length;
      nameSuffix = failedJobCount > 0
        ? `(${failedJobCount} failed job${failedJobCount !== 1 ? 's' : ''})`
        : `(${shardJobs.length} job${shardJobs.length !== 1 ? 's' : ''} passed)`;
    }

    return {
      externalId: `gh-${run.id}`,
      name: `${run.name} #${run.run_number} ${nameSuffix}`,
      triggerType: 'CI_PUSH',
      branch: run.head_branch,
      sha: run.head_sha,
      startedAt,
      finishedAt: updatedAt,
      durationMs,
      status: this.mapTestRunStatus(run.status, run.conclusion),
      results: mappedResults,
    };
  }

  /**
   * Map a GitHub workflow run's (status, conclusion) to a NormalizedTestRun
   * status.  The previous one-liner treated everything except `success` as
   * `FAILED`, which lumped cancelled and infra-error runs in with real test
   * failures and skewed Run Health.
   */
  private mapTestRunStatus(
    status: string,
    conclusion: string | null,
  ): NormalizedTestRun['status'] {
    if (status === 'queued') return 'QUEUED';
    if (status !== 'completed') return 'RUNNING';
    switch (conclusion) {
      case 'success':
        return 'PASSED';
      case 'cancelled':
        return 'CANCELLED';
      case 'timed_out':
      case 'action_required':
      case 'stale':
      case 'startup_failure':
        return 'ERRORED';
      case 'skipped':
      case 'neutral':
        return 'PASSED';
      case 'failure':
      default:
        return 'FAILED';
    }
  }

  private mapWorkflowRun(run: GitHubWorkflowRun, ghJobs: GitHubJob[]): NormalizedPipelineRun {
    const startedAt = new Date(run.run_started_at);
    const updatedAt = new Date(run.updated_at);
    const durationMs = updatedAt.getTime() - startedAt.getTime();

    return {
      externalId: run.id.toString(),
      workflowName: run.name,
      branch: run.head_branch,
      sha: run.head_sha,
      status: this.mapStatus(run.status, run.conclusion),
      durationMs,
      triggeredBy: run.actor.login,
      startedAt,
      url: run.html_url,
      jobs: ghJobs.map((job) => this.mapJob(job)),
    };
  }

  private mapStatus(status: string, conclusion: string | null): PipelineStatus {
    if (status === 'queued') return 'QUEUED';
    if (status === 'in_progress') return 'IN_PROGRESS';
    if (status === 'completed') {
      switch (conclusion) {
        case 'success':
          return 'SUCCESS';
        case 'failure':
          return 'FAILURE';
        case 'cancelled':
          return 'CANCELLED';
        default:
          return 'FAILURE';
      }
    }
    return 'IN_PROGRESS';
  }

  private mapJob(job: GitHubJob): PipelineJob {
    const started = new Date(job.started_at);
    const completed = new Date(job.completed_at);
    const durationMs = completed.getTime() - started.getTime();

    return {
      name: job.name,
      status: job.conclusion ?? 'in_progress',
      durationMs,
      steps: job.steps?.map((step) => this.mapStep(step)),
    };
  }

  private mapStep(step: GitHubStep): PipelineStep {
    const started = new Date(step.started_at);
    const completed = new Date(step.completed_at);
    const durationMs = completed.getTime() - started.getTime();

    return {
      name: step.name,
      status: step.conclusion ?? 'in_progress',
      durationMs,
    };
  }

  // ──────────────── Private: Helpers ────────────────

  /**
   * Generate a stable test ID from the test name and optional suite name.
   * Used as a fallback when TestRailId is not present in Allure labels.
   */
  private generateTestId(name: string, suiteName?: string): string {
    const raw = suiteName ? `${suiteName}::${name}` : name;
    // Simple stable hash: use the full string as the ID, replacing
    // characters that could cause issues in compound unique keys.
    return raw.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_:.-]/g, '');
  }

  private extractCredentials(config: ConnectorConfig): GitHubCredentials {
    const creds = config.credentials as {
      token?: string; owner?: string; repo?: string; url?: string;
      workflowFile?: string; workflow?: string;
      branch?: string; maxRuns?: number;
      artifactPattern?: string;
    };
    const token = creds.token;
    if (!token) throw new Error('GitHub token is required');

    let owner = creds.owner;
    let repo = creds.repo;
    const workflowFile = creds.workflowFile || creds.workflow || undefined;
    const branch = creds.branch || undefined;
    const maxRuns = creds.maxRuns || undefined;

    // Parse owner/repo from URL if not provided directly
    if ((!owner || !repo) && creds.url) {
      const match = creds.url.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (match) {
        owner = owner || match[1];
        repo = repo || match[2].replace(/\.git$/, '').replace(/\/$/, '');
      }
    }

    const artifactPattern = creds.artifactPattern || undefined;

    if (!owner) throw new Error('GitHub owner is required');
    if (!repo) throw new Error('GitHub repo is required');
    return { token, owner, repo, workflowFile, branch, maxRuns, artifactPattern };
  }
}

// ──────────────── GitHub API types (internal) ────────────────

interface GitHubWorkflowRun {
  id: number;
  run_number: number;
  name: string;
  head_branch: string;
  head_sha: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  run_started_at: string;
  updated_at: string;
  actor: { login: string };
}

interface GitHubJob {
  id: number;
  name: string;
  conclusion: string | null;
  started_at: string;
  completed_at: string;
  steps?: GitHubStep[];
}

interface GitHubStep {
  name: string;
  conclusion: string | null;
  started_at: string;
  completed_at: string;
}

interface GitHubArtifact {
  id: number;
  name: string;
  size_in_bytes: number;
  expired: boolean;
}

// ──────────────── Allure types (internal) ────────────────

interface AllureResultJson {
  uuid?: string;
  name: string;
  status: string;
  statusDetails?: {
    message?: string;
    trace?: string;
  };
  labels?: Array<{ name: string; value: string }>;
  start?: number;
  stop?: number;
}

interface AllureResult {
  name: string;
  status: 'PASSED' | 'FAILED' | 'SKIPPED' | 'ERROR';
  testRailId?: string;
  suiteName?: string;
  durationMs?: number;
  errorMessage?: string;
  stackTrace?: string;
}
