import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { Logger } from '@nestjs/common';
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
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
  /**
   * Reused parser for tier-3 JUnit/XUnit XML fallback. Configured to keep
   * attribute names visible (prefixed `@_`) so downstream code can read
   * `name`, `classname`, `time`, etc. directly without bespoke handling.
   */
  private readonly junitXmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
  });
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
   * not match any default/configured pattern. Sampled across all runs so
   * SyncService can surface a configuration warning to the connector status.
   */
  private lastSyncUnmatchedArtifactNames: string[] = [];
  /**
   * Number of completed runs whose artifact NAMES did not match any pattern
   * (configured or default). This is the "configure artifactPattern" signal.
   */
  private lastSyncRunsWithoutMatchedArtifacts = 0;
  /**
   * Number of completed runs whose artifacts MATCHED a pattern but parsed
   * zero test results — typically an HTML-only Allure report, a malformed
   * JSON, or a non-default JSON layout. This is the "fix the workflow's
   * artifact contents" signal, distinct from the name-mismatch above.
   * Codex review: previously these two cases were collapsed into a single
   * counter that the SyncService warning then mislabelled as "did not
   * match the connector pattern".
   */
  private lastSyncRunsWithoutParsedResults = 0;
  /** Total completed runs processed in the last fetch. */
  private lastSyncCompletedRuns = 0;

  /** Diagnostics from the most recent fetchTestRuns call (used by SyncService). */
  getDiagnostics(): {
    completedRuns: number;
    runsWithoutMatchedArtifacts: number;
    runsWithoutParsedResults: number;
    sampleUnmatchedArtifactNames: string[];
  } {
    return {
      completedRuns: this.lastSyncCompletedRuns,
      runsWithoutMatchedArtifacts: this.lastSyncRunsWithoutMatchedArtifacts,
      runsWithoutParsedResults: this.lastSyncRunsWithoutParsedResults,
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
    this.lastSyncRunsWithoutParsedResults = 0;
    this.lastSyncCompletedRuns = 0;
    const seenUnmatchedSet = new Set<string>();

    // Echo the effective configuration so admins can verify their setup
    // matches what they expected — especially `artifactPattern`, since a
    // misconfigured pattern silently filters out every artifact and is the
    // most common cause of "0 / 0 / 0" or "X shards (no test data)" rows.
    this.logger.log(
      `fetchTestRuns config: owner=${creds.owner} repo=${creds.repo} ` +
      `branch=${branch} maxRuns=${maxRuns} ` +
      `workflowFile=${creds.workflowFile ?? '<all>'} ` +
      `artifactPattern=${creds.artifactPattern ?? '<defaults: allure-results-shard-N → allure-results[-N|-merged] → JUnit/playwright/cypress>'}`,
    );

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
        // Codex review: only count this run as a name-mismatch when there
        // was at least one *non-expired* artifact whose name failed to
        // match. Expired-only runs cannot be fixed with `artifactPattern`
        // and would otherwise inflate the connector warning misleadingly.
        if (seenNames.length > 0) {
          this.logger.warn(
            `  No artifact matched the connector's pattern — saw [${seenNames.join(', ')}]. ` +
            `Configure 'artifactPattern' in connector settings if your repo uses a custom name.`,
          );
          for (const n of seenNames) seenUnmatchedSet.add(n);
          this.lastSyncRunsWithoutMatchedArtifacts++;
        } else {
          // All artifacts on the run were expired — log at debug only since
          // there's nothing the user can configure to recover them.
          this.logger.debug(
            `  All ${artifacts.length} artifact(s) on this run were expired; nothing to parse.`,
          );
        }
      }

      const parsedPerArtifact: Array<{ name: string; parsed: number; bytes: number; entries: number }> = [];
      for (const artifact of matchingArtifacts) {
        try {
          const downloadResult = await this.downloadAndParseAllureArtifact(
            creds,
            artifact.id,
          );
          allResults.push(...downloadResult.results);
          parsedPerArtifact.push({
            name: artifact.name,
            parsed: downloadResult.results.length,
            bytes: downloadResult.bytes,
            entries: downloadResult.zipEntries,
          });
          // INFO-level visibility: every artifact download. If a customer
          // sees thousands of test results locally but zero in QOD, this
          // line in the connector logs immediately tells them whether the
          // download / unzip / parse step is what's failing.
          this.logger.log(
            `  Artifact "${artifact.name}" (${artifact.id}): ` +
            `downloaded ${(downloadResult.bytes / 1024).toFixed(1)} KB, ` +
            `${downloadResult.zipEntries} zip entries, ` +
            `${downloadResult.results.length} test results parsed`,
          );
        } catch (err) {
          // Promote download failures to ERROR so they're visible in
          // production logs (most CI/CD log routers default to filtering
          // WARN+). Include the HTTP status / error message verbatim.
          this.logger.error(
            `  FAILED to download artifact ${artifact.id} (${artifact.name}): ` +
            `${err instanceof Error ? err.message : err}`,
          );
          parsedPerArtifact.push({ name: artifact.name, parsed: 0, bytes: 0, entries: 0 });
        }
      }

      // Step 1: surface "matched-but-empty" specifically — distinct from
      // the unmatched-name case above. Increments its own counter so the
      // SyncService warning can be specific about which failure mode.
      if (matchingArtifacts.length > 0 && allResults.length === 0) {
        this.logger.warn(
          `  Matched ${matchingArtifacts.length} artifact(s) but parsed 0 test results: ` +
          parsedPerArtifact.map((p) => `${p.name}=${p.parsed}`).join(', ') +
          `. Artifact may contain only an HTML Allure report or a non-default JSON layout.`,
        );
        this.lastSyncRunsWithoutParsedResults++;
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
      }
      testRuns.push(this.mapAllureToTestRun(run, allResults, relevantJobs));
    }

    this.lastSyncUnmatchedArtifactNames = Array.from(seenUnmatchedSet).sort();

    // INFO-level end-of-sync summary so admins can see whether parsing
    // worked at all, without sifting per-run lines.
    const totalParsedResults = testRuns.reduce(
      (sum, r) => sum + (r.results?.length ?? 0),
      0,
    );
    const summaryFallbackCount = testRuns.filter((r) => r.countSource === 'CI_JOBS').length;
    this.logger.log(
      `fetchTestRuns summary: ${this.lastSyncCompletedRuns} completed runs, ` +
      `${totalParsedResults} test results parsed across all artifacts, ` +
      `${summaryFallbackCount} runs fell back to shard counts ` +
      `(unmatched-artifact: ${this.lastSyncRunsWithoutMatchedArtifacts}, ` +
      `matched-but-empty: ${this.lastSyncRunsWithoutParsedResults})`,
    );
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

    // Tier 4: JUnit / surefire / test-report / playwright-report patterns.
    // Slightly broader than before — covers `playwright-report-*`,
    // `cypress-results`, etc. The actual content is parsed downstream by
    // tier 1/2/3 of `extractAllureResults`.
    const tier4 = fresh.filter((a) =>
      /^(test-results|junit-results|junit|test-report|surefire-reports|playwright-report|cypress-results)/.test(a.name),
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
  ): Promise<{ results: AllureResult[]; bytes: number; zipEntries: number }> {
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
        // Include enough context that the user can immediately see what
        // GitHub returned. Common modes: 401 (token expired/missing),
        // 403 (token lacks `actions:read` / fine-grained scope), 410
        // (artifact expired between list and download).
        throw new Error(
          `Failed to download artifact ${artifactId}: HTTP ${response.status} ${response.statusText}`,
        );
      }

      const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10);
      const useTempFile = contentLength > GitHubConnector.ARTIFACT_MEM_LIMIT;

      let zip: AdmZip;
      let bytes: number;

      if (useTempFile && response.body) {
        // Stream large artifacts to a temp file to avoid OOM
        const tmpFile = path.join(os.tmpdir(), `qod-artifact-${artifactId}.zip`);
        try {
          const nodeStream = Readable.fromWeb(response.body as any);
          await pipeline(nodeStream, fs.createWriteStream(tmpFile));
          bytes = fs.statSync(tmpFile).size;
          zip = new AdmZip(tmpFile);
          const entries = zip.getEntries();
          const results = this.extractAllureResults(zip);
          return { results, bytes, zipEntries: entries.length };
        } finally {
          try { fs.unlinkSync(tmpFile); } catch (e) { this.logger.debug(`Failed to clean up temp file ${tmpFile}: ${e}`); }
        }
      }

      // Default: process in memory
      const arrayBuffer = await response.arrayBuffer();
      bytes = arrayBuffer.byteLength;
      zip = new AdmZip(Buffer.from(arrayBuffer));
      const entries = zip.getEntries();
      const results = this.extractAllureResults(zip);
      return { results, bytes, zipEntries: entries.length };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Parse a downloaded artifact zip into per-test results. Tries (in order):
   *   1. Raw Allure JSON (`*-result.json`) — preserves retry info.
   *   2. Built Allure 2 HTML report (`data/test-cases/*.json`).
   *   3. JUnit / XUnit-style XML (`*.xml`) — many workflows publish this
   *      alongside or instead of Allure. Real-world QOD users have run into
   *      uniform 0/0/0 results because their artifact contains JUnit XML
   *      while QOD only knew how to parse Allure JSON.
   *
   * Returns the FIRST tier that produces results so we don't double-count
   * when multiple formats coexist in the same zip (e.g. Allure JSON +
   * JUnit XML side by side).
   *
   * Logs a sample of zip entry names when nothing parses, so the connector
   * warning + logs let users / admins see what the artifact actually
   * contains and configure / fix their workflow accordingly.
   */
  private extractAllureResults(zip: AdmZip): AllureResult[] {
    const entries = zip.getEntries();

    // Tier 1: raw Allure JSON.
    const allureRaw: AllureResult[] = [];
    let allureRawCandidates = 0;
    for (const entry of entries) {
      if (entry.isDirectory || !entry.entryName.endsWith('-result.json')) continue;
      allureRawCandidates++;
      try {
        const content = entry.getData().toString('utf8');
        const parsed = JSON.parse(content) as AllureResultJson;
        allureRaw.push(this.parseAllureResult(parsed));
      } catch (error) {
        this.logger.debug(`Skipping malformed Allure entry ${entry.entryName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (allureRaw.length > 0) return allureRaw;

    // Tier 2: built Allure 2 HTML report (`allure generate` output).
    const builtAllure = this.extractBuiltAllureReport(zip);
    if (builtAllure.length > 0) return builtAllure;

    // Tier 3: JUnit/XUnit XML. Common in workflows that haven't migrated to
    // Allure JSON yet, or that publish JUnit XML in addition to Allure
    // (e.g. via Maven Surefire / pytest --junit-xml / gradle test).
    const junit = this.extractJUnitXml(zip);
    if (junit.length > 0) return junit;

    // Diagnostic: when nothing parses, log the zip's top-level structure so
    // the user can tell whether their artifact contains JUnit / Cucumber /
    // TestNG / something else and either configure `artifactPattern` or
    // fix their workflow's upload step. Sampled to avoid log spam on huge
    // artifacts.
    const sample = entries
      .filter((e) => !e.isDirectory)
      .slice(0, 25)
      .map((e) => e.entryName);
    this.logger.warn(
      `  Artifact has 0 parseable test results. ` +
      `Tried Allure raw (${allureRawCandidates} *-result.json candidates), ` +
      `Allure built-report (data/test-cases/*.json), and JUnit XML. ` +
      `Sample of zip entries: [${sample.join(', ')}]` +
      (entries.length > sample.length ? ` (… +${entries.length - sample.length} more)` : ''),
    );

    return [];
  }

  /**
   * Tier-3 fallback: parse JUnit/XUnit-style XML test result files.
   * Looks at any `*.xml` entry and tries to extract `<testcase>` elements
   * from `<testsuite>` / `<testsuites>` wrappers. Per-test status is derived
   * from `<failure>` / `<error>` / `<skipped>` children.
   */
  private extractJUnitXml(zip: AdmZip): AllureResult[] {
    const results: AllureResult[] = [];
    let candidates = 0;
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory || !entry.entryName.toLowerCase().endsWith('.xml')) continue;
      candidates++;
      try {
        const xml = entry.getData().toString('utf8');
        // Cheap pre-check before invoking the full parser — if the file
        // doesn't even mention testcase, skip without paying parse cost.
        if (!/\<testcase\b/i.test(xml)) continue;
        const parsed = this.junitXmlParser.parse(xml);
        const suites = this.collectJUnitSuites(parsed);
        for (const suite of suites) {
          const suiteName = (suite['@_name'] as string | undefined) ?? '';
          const testcases = this.toArrayUnknown(suite.testcase);
          for (const tc of testcases) {
            results.push(this.parseJUnitTestCase(tc as Record<string, unknown>, suiteName));
          }
        }
      } catch (error) {
        this.logger.debug(
          `Skipping malformed JUnit XML ${entry.entryName}: ` +
          `${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    if (candidates > 0 && results.length === 0) {
      this.logger.debug(`  Scanned ${candidates} XML file(s) but found no JUnit <testcase> elements.`);
    }
    return results;
  }

  /** Extract testsuite nodes from either <testsuites> or top-level <testsuite>. */
  private collectJUnitSuites(parsed: Record<string, unknown>): Array<Record<string, unknown>> {
    const out: Array<Record<string, unknown>> = [];
    if (parsed.testsuites) {
      const wrapper = parsed.testsuites as Record<string, unknown>;
      out.push(...this.toArrayUnknown<Record<string, unknown>>(wrapper.testsuite));
    }
    if (parsed.testsuite) {
      out.push(...this.toArrayUnknown<Record<string, unknown>>(parsed.testsuite));
    }
    return out;
  }

  private parseJUnitTestCase(tc: Record<string, unknown>, suiteName: string): AllureResult {
    const name = (tc['@_name'] as string) ?? '';
    const classname = (tc['@_classname'] as string) ?? '';
    const timeSeconds = parseFloat((tc['@_time'] as string) || '0');
    const durationMs = Math.round(timeSeconds * 1000);

    let status: AllureResult['status'] = 'PASSED';
    let errorMessage: string | undefined;
    let stackTrace: string | undefined;
    if (tc.failure) {
      status = 'FAILED';
      const failure = this.firstOrSelfUnknown(tc.failure);
      errorMessage = (failure as Record<string, unknown>)['@_message'] as string | undefined;
      stackTrace = this.extractTextUnknown(failure);
    } else if (tc.error) {
      status = 'ERROR';
      const error = this.firstOrSelfUnknown(tc.error);
      errorMessage = (error as Record<string, unknown>)['@_message'] as string | undefined;
      stackTrace = this.extractTextUnknown(error);
    } else if (tc.skipped !== undefined) {
      status = 'SKIPPED';
    }

    // Synthesize an Allure-shape result so the rest of the pipeline (TestRail
    // extraction, dedup, retry detection) treats JUnit results uniformly.
    // We pretend each JUnit testcase is its own variant — historyId derived
    // from (classname, name, time) is stable per execution.
    const fullName = classname ? `${classname}.${name}` : name;
    const historyId = `junit:${fullName}:${timeSeconds}`;
    const synthJson: AllureResultJson = {
      uuid: undefined,
      historyId,
      name,
      fullName,
      status: status === 'PASSED' ? 'passed'
        : status === 'FAILED' ? 'failed'
        : status === 'ERROR' ? 'broken'
        : 'skipped',
      statusDetails: errorMessage || stackTrace ? { message: errorMessage, trace: stackTrace } : undefined,
      labels: suiteName ? [{ name: 'suite', value: suiteName }] : [],
    };
    const r = this.parseAllureResult(synthJson);
    // Override durationMs since JUnit gives us total time directly (synthJson
    // had no start/stop).
    r.durationMs = durationMs > 0 ? durationMs : r.durationMs;
    // testExternalId fallback handled by mapAllureToTestRun, but we also
    // surface a class+method id when nothing else identifies the test.
    return r;
  }

  private extractTextUnknown(node: unknown): string | undefined {
    if (typeof node === 'string') return node.trim() || undefined;
    if (node && typeof node === 'object') {
      const text = (node as Record<string, unknown>)['#text'];
      if (typeof text === 'string') return text.trim() || undefined;
    }
    return undefined;
  }

  private firstOrSelfUnknown(value: unknown): unknown {
    return Array.isArray(value) ? value[0] : value;
  }

  private toArrayUnknown<T = unknown>(value: unknown): T[] {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? (value as T[]) : ([value as T]);
  }

  /**
   * Parse the built-report JSON layout: `data/test-cases/<uuid>.json` files
   * inside an `allure generate` output. Each file has a different shape
   * from the raw result — `name`, `status`, `time: { duration }`,
   * `links: [{type, name, url}]`, `extra: { tags: [...] }` etc.
   */
  private extractBuiltAllureReport(zip: AdmZip): AllureResult[] {
    interface BuiltAllureTestCase {
      uid?: string;
      historyId?: string;
      name?: string;
      fullName?: string;
      status?: string;
      time?: { duration?: number };
      statusMessage?: string;
      statusTrace?: string;
      links?: Array<{ name?: string; url?: string; type?: string }>;
      labels?: Array<{ name: string; value: string }>;
      parameters?: Array<{ name?: string; value?: string }>;
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
          uuid: tc.uid,
          historyId: tc.historyId,
          name: tc.name ?? '',
          fullName: tc.fullName,
          status: tc.status ?? 'unknown',
          statusDetails: (tc.statusMessage || tc.statusTrace)
            ? { message: tc.statusMessage, trace: tc.statusTrace }
            : undefined,
          labels: synthLabels,
          links: tc.links,
          parameters: tc.parameters,
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

    // Stable fingerprint of test parameters (data-driven row) — used as
    // part of the dedup-key fallback when Allure's `historyId` is absent.
    // We sort by parameter name first so different ordering doesn't change
    // the fingerprint.
    const parameters = json.parameters ?? [];
    const parametersFingerprint = parameters.length === 0
      ? undefined
      : parameters
          .map((p) => `${p.name ?? ''}=${p.value ?? ''}`)
          .sort()
          .join('|');

    return {
      name: json.name,
      fullName: json.fullName,
      historyId: json.historyId,
      parametersFingerprint,
      status: this.mapAllureStatus(json.status),
      testRailId,
      suiteName,
      durationMs,
      errorMessage: json.statusDetails?.message,
      stackTrace: json.statusDetails?.trace,
      startedAt: typeof json.start === 'number' ? json.start : undefined,
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

    // Group retry attempts by Allure's `historyId` (or a deterministic
    // fallback). Allure assigns the same historyId to every attempt of the
    // *same* test variant (i.e. retries of `methodName` with the same
    // parameters), but a *different* historyId to each parametrized variant.
    // The previous key — `testRailId || generateTestId(name, suite)` —
    // collapsed every parametrized variant of a test method into ONE result
    // because all variants share the same `@TmsLink` and have identical
    // `name`. A 2 000-test workflow with 100 methods × 20 parameters
    // therefore showed up as ~100 results in Run History; this fix keeps
    // them as 2 000.
    const dedupKey = (r: AllureResult): string => {
      if (r.historyId) return `h:${r.historyId}`;
      // Fallback when Allure data lacks historyId — combine the most
      // distinguishing fields we have. Real-world Allure always emits
      // historyId, so this branch is mostly defensive.
      // Codex review: include `suiteName` when `fullName` is missing so two
      // unrelated tests with the same `name` in different suites don't
      // collapse to one group under older / custom Allure adapters.
      const baseName = r.fullName ?? (r.suiteName ? `${r.suiteName}::${r.name}` : r.name);
      const variantKey = `${baseName}::${r.parametersFingerprint ?? ''}`;
      // Including testRailId lets us still merge true retries (same name,
      // same params) when historyId is absent, while different parametrized
      // variants (different params) stay distinct.
      return `f:${r.testRailId ?? ''}::${variantKey}`;
    };

    const attemptsByGroup = new Map<string, AllureResult[]>();
    for (const r of allureResults) {
      const key = dedupKey(r);
      const list = attemptsByGroup.get(key);
      if (list) list.push(r);
      else attemptsByGroup.set(key, [r]);
    }
    const rawCount = allureResults.length;
    const dedupedCount = attemptsByGroup.size;
    if (rawCount > 0) {
      this.logger.log(
        `  Deduplication: ${rawCount} raw Allure results → ${dedupedCount} unique tests` +
          (rawCount > dedupedCount * 2
            ? ` (${rawCount - dedupedCount} attempts merged as retries)`
            : ''),
      );
    }

    const mappedResults: NormalizedTestResult[] = [];
    for (const [, attemptsUnsorted] of attemptsByGroup.entries()) {
      // Order attempts by Allure's `start` so retryIndex reflects execution
      // order (retries can arrive in any zip order).
      const attempts = [...attemptsUnsorted].sort((a, b) => {
        const ax = a.startedAt ?? 0;
        const bx = b.startedAt ?? 0;
        return ax - bx;
      });
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

      // testExternalId stays keyed on TestRail ID when available so all
      // parametrized variants of a TmsLink-tagged method link to the SAME
      // TestRail test_case (multiple test_results per test_case). When
      // testRailId is absent, fall back to historyId so each variant gets
      // its own auto-created github-source test_case rather than collapsing.
      const testExternalId =
        carrier.testRailId ||
        (carrier.historyId ? `gh-history-${carrier.historyId}` : this.generateTestId(carrier.name, carrier.suiteName));

      mappedResults.push({
        testExternalId,
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
  /**
   * Allure's stable identity for a test variant: hash of (fullName +
   * parameters). Same across retries of the same parametrized variant,
   * different across variants. We use this as the dedup key in
   * mapAllureToTestRun so 2 000 parametrized invocations of 100 methods
   * stay 2 000 distinct results instead of collapsing to 100.
   */
  historyId?: string;
  name: string;
  fullName?: string;
  status: string;
  statusDetails?: {
    message?: string;
    trace?: string;
  };
  labels?: Array<{ name: string; value: string }>;
  links?: Array<{ name?: string; url?: string; type?: string }>;
  /** Test parameters (data-driven row). Used in the dedup-key fallback when historyId is absent. */
  parameters?: Array<{ name?: string; value?: string }>;
  start?: number;
  stop?: number;
}

interface AllureResult {
  name: string;
  fullName?: string;
  historyId?: string;
  parametersFingerprint?: string;
  status: 'PASSED' | 'FAILED' | 'SKIPPED' | 'ERROR';
  testRailId?: string;
  suiteName?: string;
  durationMs?: number;
  errorMessage?: string;
  stackTrace?: string;
  /** Allure's `start` timestamp — used to order retries when computing retryIndex. */
  startedAt?: number;
}
