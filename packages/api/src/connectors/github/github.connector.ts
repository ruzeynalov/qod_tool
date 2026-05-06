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

  /**
   * Names of artifacts seen in the most recent fetchTestRuns call that did
   * not match any default pattern. Sampled across all runs so SyncService
   * can surface a configuration warning to the connector status.
   */
  private lastSyncUnmatchedArtifactNames: string[] = [];
  /** Number of completed runs in the last fetch where no artifact matched. */
  private lastSyncRunsWithoutMatchedArtifacts = 0;
  /** Total completed runs processed in the last fetch. */
  private lastSyncCompletedRuns = 0;

  /** Diagnostics from the most recent fetchTestRuns call (used by SyncService). */
  getDiagnostics(): {
    completedRuns: number;
    runsWithoutMatchedArtifacts: number;
    sampleUnmatchedArtifactNames: string[];
  } {
    return {
      completedRuns: this.lastSyncCompletedRuns,
      runsWithoutMatchedArtifacts: this.lastSyncRunsWithoutMatchedArtifacts,
      sampleUnmatchedArtifactNames: this.lastSyncUnmatchedArtifactNames.slice(0, 20),
    };
  }

  async fetchTestRuns(config: ConnectorConfig, _since?: Date): Promise<NormalizedTestRun[]> {
    const creds = this.extractCredentials(config);
    const branch = creds.branch || 'main';
    const maxRuns = creds.maxRuns || 10;

    // Reset diagnostics for this sync.
    this.lastSyncUnmatchedArtifactNames = [];
    this.lastSyncRunsWithoutMatchedArtifacts = 0;
    this.lastSyncCompletedRuns = 0;
    const seenUnmatchedSet = new Set<string>();

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
      this.lastSyncCompletedRuns++;

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
      const allResults: AllureResult[] = [];
      const matchingArtifacts = this.selectArtifacts(artifacts, creds.artifactPattern);
      const expiredCount = artifacts.filter((a) => a.expired).length;
      const matchedNames = matchingArtifacts.map((a) => a.name);
      // Step 1 (Codex precision): per-run diagnostic line distinguishes
      // "name didn't match" from "name matched but parsed 0 results".
      this.logger.log(
        `  Artifacts: ${artifacts.length} total, ${expiredCount} expired, ${matchingArtifacts.length} matched ` +
        `(matched=[${matchedNames.join(', ')}])`,
      );
      if (matchingArtifacts.length === 0 && artifacts.length > 0) {
        // No defaults / configured pattern matched any non-expired artifact —
        // surface the seen names so the user can configure `artifactPattern`.
        const seenNames = artifacts.filter((a) => !a.expired).map((a) => a.name);
        this.logger.warn(
          `  No artifact matched the connector's pattern — saw [${seenNames.join(', ')}]. ` +
          `Configure 'artifactPattern' in connector settings if your repo uses a custom name.`,
        );
        for (const n of seenNames) seenUnmatchedSet.add(n);
      }

      const parsedPerArtifact: Array<{ name: string; parsed: number }> = [];
      for (const artifact of matchingArtifacts) {
        try {
          const results = await this.downloadAndParseAllureArtifact(
            creds,
            artifact.id,
          );
          allResults.push(...results);
          parsedPerArtifact.push({ name: artifact.name, parsed: results.length });
        } catch (err) {
          this.logger.warn(
            `  Failed to download artifact ${artifact.id} (${artifact.name}): ` +
            `${err instanceof Error ? err.message : err}`,
          );
          parsedPerArtifact.push({ name: artifact.name, parsed: 0 });
        }
      }

      // Step 1: surface "matched-but-empty" specifically — distinct from
      // the unmatched-name case above.
      if (matchingArtifacts.length > 0 && allResults.length === 0) {
        this.logger.warn(
          `  Matched ${matchingArtifacts.length} artifact(s) but parsed 0 test results: ` +
          parsedPerArtifact.map((p) => `${p.name}=${p.parsed}`).join(', ') +
          `. Artifact may contain only an HTML Allure report or a non-default JSON layout.`,
        );
      } else if (allResults.length > 0) {
        this.logger.log(
          `  Parsed ${allResults.length} test results: ` +
          parsedPerArtifact.map((p) => `${p.name}=${p.parsed}`).join(', '),
        );
      }

      // 5. Always emit a NormalizedTestRun for each completed workflow run,
      // even when no test results could be parsed. Failed builds (lint/setup
      // failures, expired artifacts, missing upload step) must still appear in
      // test_runs so Run Health / Daily Run Results / Run History count them.
      if (allResults.length === 0) {
        this.logger.log(`  Emitting run with empty results (conclusion=${run.conclusion ?? 'null'})`);
        this.lastSyncRunsWithoutMatchedArtifacts++;
      }
      testRuns.push(this.mapAllureToTestRun(run, allResults, relevantJobs));
    }

    this.lastSyncUnmatchedArtifactNames = Array.from(seenUnmatchedSet).sort();
    return testRuns;
  }

  /**
   * Pick the matching artifacts in priority order. Returns the FIRST tier that
   * contains at least one non-expired artifact, so we never accidentally pull
   * a built `allure-report` when a raw `allure-results-*` artifact is also
   * present.
   *
   * Priority:
   *   1. User-configured `artifactPattern` (supports `*` wildcards).
   *   2. Strict raw-Allure shard pattern: `allure-results-shard-N`.
   *   3. Common Allure naming variants:
   *        - `allure-results` / `allure-results-N` (non-`shard-` numeric)
   *        - `allure-results-(merged|combined|all)`
   *      Limited to that small set so we don't match `allure-report` (HTML).
   *   4. Common JUnit/test-result artifact names — last resort.
   */
  private selectArtifacts(
    artifacts: GitHubArtifact[],
    artifactPattern: string | undefined,
  ): GitHubArtifact[] {
    const fresh = artifacts.filter((a) => !a.expired);

    if (artifactPattern) {
      const regex = new RegExp('^' + artifactPattern.replace(/\*/g, '.*') + '$');
      return fresh.filter((a) => regex.test(a.name));
    }

    // Tier 2: strict raw shard pattern
    const tier2 = fresh.filter((a) => /^allure-results-shard-\d+$/.test(a.name));
    if (tier2.length > 0) return tier2;

    // Tier 3: broader Allure naming variants — bare, indexed, merged. Avoids
    // `allure-report` (built HTML) and other ad-hoc names.
    const tier3 = fresh.filter(
      (a) =>
        a.name === 'allure-results' ||
        /^allure-results-\d+$/.test(a.name) ||
        /^allure-results-(merged|combined|all|raw)$/.test(a.name),
    );
    if (tier3.length > 0) return tier3;

    // Tier 4: JUnit / surefire / test-report patterns
    const tier4 = fresh.filter((a) =>
      /^(test-results|junit-results|test-report|surefire-reports)/.test(a.name),
    );
    return tier4;
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
    // First try raw Allure: <uuid>-result.json files. This is the primary
    // path and preserves retry information so within-run FLAKY detection
    // continues to work.
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
    if (results.length > 0) return results;

    // Fallback: parse a BUILT Allure 2 report. Some workflows upload only the
    // generated HTML report (`allure generate` output) which contains
    // `data/test-cases/<uuid>.json` instead of raw `*-result.json`. Lower
    // fidelity — the built report already collapses retries, so within-run
    // FLAKY detection cannot work on this path. Still better than no data.
    return this.extractBuiltAllureReport(zip);
  }

  /**
   * Parse the built-report JSON layout: `data/test-cases/<uuid>.json` files
   * inside an `allure generate` output. Each file has a different shape
   * from the raw result — `name`, `status`, `time: { duration }`,
   * `links: [{type, name, url}]`, `extra: { tags: [...] }` etc.
   */
  private extractBuiltAllureReport(zip: AdmZip): AllureResult[] {
    interface BuiltAllureTestCase {
      name?: string;
      fullName?: string;
      status?: string;
      time?: { duration?: number };
      statusMessage?: string;
      statusTrace?: string;
      links?: Array<{ name?: string; url?: string; type?: string }>;
      labels?: Array<{ name: string; value: string }>;
      extra?: { tags?: string[] };
    }

    const results: AllureResult[] = [];
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      // Match `data/test-cases/<anything>.json` anywhere inside the zip.
      // Some generators include a top-level dir prefix like
      // `allure-report/data/test-cases/...`.
      if (!/(?:^|\/)data\/test-cases\/[^/]+\.json$/.test(entry.entryName)) continue;
      try {
        const content = entry.getData().toString('utf8');
        const tc = JSON.parse(content) as BuiltAllureTestCase;
        // Synthesize a raw-shape AllureResultJson so parseAllureResult can
        // reuse all the TestRailId-extraction logic.
        const synthLabels = (tc.labels ?? []).slice();
        for (const t of tc.extra?.tags ?? []) synthLabels.push({ name: 'tag', value: t });
        const json: AllureResultJson = {
          name: tc.name ?? '',
          fullName: tc.fullName,
          status: tc.status ?? 'unknown',
          statusDetails: (tc.statusMessage || tc.statusTrace)
            ? { message: tc.statusMessage, trace: tc.statusTrace }
            : undefined,
          labels: synthLabels,
          links: tc.links,
          // Synthesize start/stop so durationMs comes through.
          start: 0,
          stop: tc.time?.duration ?? 0,
        };
        results.push(this.parseAllureResult(json));
      } catch (error) {
        this.logger.debug(
          `Skipping malformed built-report entry ${entry.entryName}: ` +
          `${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return results;
  }

  private parseAllureResult(json: AllureResultJson): AllureResult {
    // Extract TestRailId from any of:
    //   - { name: 'tag', value: 'TestRailId:C3538' }       (existing custom convention)
    //   - { name: 'tag', value: 'C3538' }                  (bare TestRail ID tag, REQUIRES C/CC/Cyrillic-С prefix)
    //   - { name: 'tms', value: 'C3538' | '3538' }         (Allure @TmsLink — bare numeric allowed, field is ID-typed)
    //   - { name: 'as_id' / 'allure-id', value: '3538' }   (Allure @AllureId — bare numeric allowed)
    //   - links[]: { type: 'tms', name: 'C3538' | url: '.../C3538' }
    //   - the test name / fullName (e.g. "C3538: Verify ...") — REQUIRES C-prefix
    //
    // Validation rules (Codex review): generic `tag` and the name fallback
    // must require an explicit `C`/`CC`/Cyrillic-`С` prefix so that plain
    // numeric tags like `2026` (e.g. a sprint or year tag) are not accidentally
    // promoted to TestRail IDs. Explicit ID-typed fields (`tms`, `as_id`,
    // links[type=tms]) carry ID semantics and may use a bare numeric value,
    // but the captured token still has to be purely digits — `JIRA-123` must
    // not normalize to `123`.
    let testRailId: string | undefined;
    let suiteName: string | undefined;

    /** Accepts a `C`/`CC`/Cyrillic-`С` prefixed token, strips the prefix. */
    const setPrefixed = (raw: string | undefined) => {
      if (testRailId || !raw) return;
      const m = raw.trim().match(/^(?:CC|[CС])(\d{2,})$/);
      if (m) testRailId = m[1];
    };

    /**
     * Accepts an ID-typed field's value (e.g. tms / as_id / links[type=tms]).
     * Allows either a `C`-prefixed token or a bare numeric — these fields
     * already advertise ID semantics so `4570` is meaningful.
     */
    const setFromIdField = (raw: string | undefined) => {
      if (testRailId || !raw) return;
      const trimmed = raw.trim();
      const prefixed = trimmed.match(/^(?:CC|[CС])(\d{2,})$/);
      if (prefixed) {
        testRailId = prefixed[1];
        return;
      }
      if (/^\d{2,}$/.test(trimmed)) testRailId = trimmed;
    };

    for (const label of json.labels ?? []) {
      const name = label.name?.toLowerCase();
      const value = label.value;
      if (!value) continue;
      if (name === 'tag') {
        if (value.startsWith('TestRailId:')) {
          // The custom `TestRailId:` prefix already advertises ID intent — the
          // value after it may be `C4570` or just `4570`.
          setFromIdField(value.substring('TestRailId:'.length));
        } else {
          // Generic tag — only accept C-prefixed tokens to avoid false
          // matches on year/sprint/etc. numeric tags.
          setPrefixed(value);
        }
      } else if (name === 'tms' || name === 'testid' || name === 'as_id' || name === 'allure_id' || name === 'allure-id') {
        setFromIdField(value);
      } else if (name === 'suite') {
        suiteName = value;
      }
    }

    if (!testRailId) {
      for (const link of json.links ?? []) {
        if (link.type?.toLowerCase() !== 'tms') continue;
        // Prefer the explicit name; fall back to the trailing path segment of
        // the URL. Both must be a C-prefixed or bare-numeric ID token —
        // `https://jira.example/browse/JIRA-456` should NOT match.
        if (link.name) setFromIdField(link.name);
        if (!testRailId && link.url) {
          const tail = link.url.split(/[/?#]/).filter(Boolean).pop();
          setFromIdField(tail);
        }
      }
    }

    if (!testRailId) {
      // Last-resort: scan the test name / fullName for a stand-alone "C\d+"
      // (or Cyrillic equivalent) token. The C prefix is required here too —
      // bare numeric tokens in test titles are too ambiguous to trust.
      const haystacks = [json.name, json.fullName].filter(Boolean) as string[];
      for (const text of haystacks) {
        const m = text.match(/(?:^|[^a-zA-Z0-9])(?:CC|[CС])(\d{3,})(?=$|[^a-zA-Z0-9])/);
        if (m) {
          // Already a digits-only capture group; assign directly so we don't
          // re-validate against the prefixed regex.
          testRailId = m[1];
          break;
        }
      }
    }

    // Built Allure reports synthesize start=0 / stop=duration, so a falsy
    // `start` is valid. Use type-aware checks to compute the difference
    // when both are numeric.
    const durationMs =
      typeof json.start === 'number' && typeof json.stop === 'number'
        ? Math.max(json.stop - json.start, 0)
        : undefined;

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

    // When no per-test data parsed (artifacts missing / non-standard naming /
    // expired), fall back to shard/job conclusions so Run History still shows
    // non-zero counts. Each shard or job is treated as one "execution unit".
    // This avoids creating synthetic per-shard test_cases while keeping the
    // pass-rate column meaningful. The countSource field tells consumers
    // these are CI-level numbers (shards), not test counts.
    const summaryCounts = mappedResults.length === 0 && shardJobs.length > 0
      ? this.shardJobsToSummaryCounts(shardJobs)
      : undefined;
    const countSource: NormalizedTestRun['countSource'] = summaryCounts ? 'CI_JOBS' : 'TEST_RESULTS';

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
      countSource,
      ...(summaryCounts ? { summaryCounts } : {}),
    };
  }

  /**
   * Derive run-level counts from job conclusions when per-test results are
   * unavailable. One unit per shard/job; conclusion → status mapping mirrors
   * mapTestRunStatus so a `cancelled` shard counts as skipped/cancelled, not
   * passed.
   */
  private shardJobsToSummaryCounts(jobs: GitHubJob[]): {
    totalTests: number;
    passedCount: number;
    failedCount: number;
    skippedCount: number;
    erroredCount: number;
  } {
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let errored = 0;
    for (const job of jobs) {
      switch (job.conclusion) {
        case 'success':
          passed++;
          break;
        case 'failure':
          failed++;
          break;
        case 'cancelled':
        case 'skipped':
        case 'neutral':
          skipped++;
          break;
        case 'timed_out':
        case 'startup_failure':
        case 'action_required':
        case 'stale':
          errored++;
          break;
        default:
          // null / unknown → treat as failure-like
          failed++;
      }
    }
    return {
      totalTests: jobs.length,
      passedCount: passed,
      failedCount: failed,
      skippedCount: skipped,
      erroredCount: errored,
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
      // `skipped` (path/condition-skipped workflow) and `neutral` (custom
      // action's "neither success nor failure" outcome) mean tests did NOT
      // execute. Mapping them to PASSED would inflate pass-rate analytics
      // — getPassRateTrend.passedRuns increments for any PASSED run. Treat
      // them as CANCELLED so they appear in Run Health as unhealthy and
      // stay out of pass-oriented metrics.
      case 'skipped':
      case 'neutral':
        return 'CANCELLED';
      case 'timed_out':
      case 'action_required':
      case 'stale':
      case 'startup_failure':
        return 'ERRORED';
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
  fullName?: string;
  status: string;
  statusDetails?: {
    message?: string;
    trace?: string;
  };
  labels?: Array<{ name: string; value: string }>;
  links?: Array<{ name?: string; url?: string; type?: string }>;
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
