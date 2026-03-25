import { Logger } from '@nestjs/common';
import type {
  IQODConnector,
  ConnectorConfig,
  ConnectorCategory,
  AuthResult,
  NormalizedTestCase,
  NormalizedTestRun,
  NormalizedTestResult,
} from '@qod/shared';

interface TestRailCredentials {
  baseUrl: string;
  email: string;
  apiKey: string;
  projectId: string;
}

interface TestRailPaginatedResponse<T> {
  offset: number;
  limit: number;
  size: number;
  _links: { next: string | null };
  [key: string]: T[] | number | { next: string | null } | undefined;
}

const STATUS_MAP: Record<number, NormalizedTestResult['status']> = {
  1: 'PASSED',
  2: 'SKIPPED',  // BLOCKED -> SKIPPED
  3: 'SKIPPED',  // UNTESTED -> SKIPPED
  4: 'FAILED',   // RETEST -> FAILED
  5: 'FAILED',
};

const TYPE_MAP: Record<number, NormalizedTestCase['type']> = {
  1: 'MANUAL',
  3: 'AUTOMATED',
};

export function parseElapsed(elapsed: string | null | undefined): number | undefined {
  if (!elapsed) return undefined;

  let ms = 0;
  const hours = elapsed.match(/(\d+)h/);
  const minutes = elapsed.match(/(\d+)m(?!s)/);
  const seconds = elapsed.match(/(\d+)s/);

  if (hours) ms += parseInt(hours[1], 10) * 3600000;
  if (minutes) ms += parseInt(minutes[1], 10) * 60000;
  if (seconds) ms += parseInt(seconds[1], 10) * 1000;

  return ms || undefined;
}

export class TestRailConnector implements IQODConnector {
  readonly name = 'testrail';
  readonly type: ConnectorCategory = 'tms';
  private readonly logger = new Logger('TestRailConnector');

  private getCredentials(config: ConnectorConfig): TestRailCredentials {
    const creds = config.credentials as Record<string, string>;
    return {
      baseUrl: (creds.baseUrl || creds.url || '').replace(/\/+$/, ''),
      email: creds.email || creds.username || '',
      apiKey: creds.apiKey || '',
      projectId: creds.projectId || '',
    };
  }

  private getHeaders(creds: TestRailCredentials): Record<string, string> {
    const token = Buffer.from(`${creds.email}:${creds.apiKey}`).toString('base64');
    return {
      Authorization: `Basic ${token}`,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(creds: TestRailCredentials, path: string, retries = 3): Promise<T> {
    const url = `${creds.baseUrl}/index.php?/api/v2/${path}`;
    const response = await fetch(url, {
      headers: this.getHeaders(creds),
      signal: AbortSignal.timeout(30_000),
    });

    if (response.status === 429 && retries > 0) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '2', 10);
      const waitMs = (isNaN(retryAfter) ? 2 : Math.max(retryAfter, 1)) * 1000;
      this.logger.warn(`Rate limited by TestRail, waiting ${waitMs}ms before retry (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      return this.request<T>(creds, path, retries - 1);
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`TestRail API error ${response.status}: ${body}`);
    }

    return response.json() as Promise<T>;
  }

  private async fetchPaginated<T>(
    creds: TestRailCredentials,
    basePath: string,
    dataKey: string,
  ): Promise<T[]> {
    const all: T[] = [];
    let offset = 0;
    const limit = 250;

    while (true) {
      const path = `${basePath}&offset=${offset}&limit=${limit}`;
      const response = await this.request<TestRailPaginatedResponse<T>>(creds, path);
      const items = (response[dataKey] as T[]) || [];
      all.push(...items);

      if (!response._links.next) break;
      offset += limit;
    }

    return all;
  }

  async authenticate(config: ConnectorConfig): Promise<AuthResult> {
    const creds = this.getCredentials(config);

    try {
      const user = await this.request<Record<string, unknown>>(
        creds,
        `get_user_by_email&email=${creds.email}`,
      );

      return { success: true, metadata: user };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  async testConnection(config: ConnectorConfig): Promise<AuthResult> {
    return this.authenticate(config);
  }

  private async fetchSuites(creds: TestRailCredentials): Promise<Record<string, unknown>[]> {
    try {
      const response = await this.request<TestRailPaginatedResponse<Record<string, unknown>>>(
        creds,
        `get_suites/${creds.projectId}`,
      );
      return (response.suites as Record<string, unknown>[]) || [];
    } catch (error) {
      // Single-suite project mode — no suites endpoint
      this.logger.debug(`Suites endpoint not available (single-suite mode): ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  private async fetchCaseTypes(creds: TestRailCredentials): Promise<Map<number, string>> {
    try {
      const types = await this.request<Array<{ id: number; name: string }>>(
        creds,
        'get_case_types',
      );
      const map = new Map<number, string>();
      for (const t of types) {
        map.set(t.id, t.name);
      }
      return map;
    } catch (error) {
      this.logger.debug(`Failed to fetch case types: ${error instanceof Error ? error.message : String(error)}`);
      return new Map();
    }
  }

  async fetchTestCases(config: ConnectorConfig, _since?: Date): Promise<NormalizedTestCase[]> {
    const creds = this.getCredentials(config);
    const projectId = creds.projectId;

    // Check if project uses multiple suites
    const [suites, caseTypeMap] = await Promise.all([
      this.fetchSuites(creds),
      this.fetchCaseTypes(creds),
    ]);
    const suiteIds = suites.length > 0
      ? suites.map((s) => s.id as number)
      : [undefined]; // single-suite mode: no suite_id needed

    let allCases: Record<string, unknown>[] = [];
    let allSections: Record<string, unknown>[] = [];

    for (const suiteId of suiteIds) {
      const suiteParam = suiteId != null ? `&suite_id=${suiteId}` : '';
      const [cases, sections] = await Promise.all([
        this.fetchPaginated<Record<string, unknown>>(creds, `get_cases/${projectId}${suiteParam}`, 'cases'),
        this.fetchPaginated<Record<string, unknown>>(creds, `get_sections/${projectId}${suiteParam}`, 'sections'),
      ]);
      allCases.push(...cases);
      allSections.push(...sections);
    }

    const cases = allCases;
    const sections = allSections;

    const sectionMap = new Map<number, string>();
    for (const section of sections) {
      sectionMap.set(section.id as number, section.name as string);
    }

    return cases.map((c) => {
      const typeId = c.type_id as number;
      const customAutomationType = c.custom_automation_type as number | null | undefined;
      const isAutomated = c.is_automated as boolean | undefined;
      const customLabels = (c.custom_labels as string) || '';
      const refs = (c.refs as string | null) || undefined;

      let automationStatus: NormalizedTestCase['automationStatus'] = 'NOT_AUTOMATED';
      if (customAutomationType != null && customAutomationType > 0) {
        automationStatus = 'AUTOMATED';
      } else if (isAutomated) {
        automationStatus = 'AUTOMATED';
      } else if (TYPE_MAP[typeId] === 'AUTOMATED') {
        automationStatus = 'AUTOMATED';
      }

      const tags = customLabels
        ? customLabels.split(',').map((t) => t.trim()).filter(Boolean)
        : [];

      return {
        externalId: String(c.id),
        title: c.title as string,
        type: TYPE_MAP[typeId] || 'MANUAL',
        automationStatus,
        suiteName: sectionMap.get(c.section_id as number),
        tags,
        references: refs,
        testRailType: caseTypeMap.get(typeId),
      };
    });
  }

  private async normalizeRun(
    creds: TestRailCredentials,
    run: Record<string, unknown>,
    planName?: string,
  ): Promise<NormalizedTestRun> {
    const runId = run.id as number;

    const [results, tests] = await Promise.all([
      this.fetchPaginated<Record<string, unknown>>(
        creds,
        `get_results_for_run/${runId}`,
        'results',
      ),
      this.fetchPaginated<Record<string, unknown>>(
        creds,
        `get_tests/${runId}`,
        'tests',
      ),
    ]);

    const testByTestId = new Map<number, Record<string, unknown>>();
    for (const test of tests) {
      testByTestId.set(test.id as number, test);
    }

    const normalizedResults: NormalizedTestResult[] = [];
    for (const r of results) {
      const testId = r.test_id as number;
      const test = testByTestId.get(testId);
      const caseId = test ? (test.case_id as number) : (r.case_id as number);
      if (caseId == null) continue; // skip results without a valid case ID

      const statusId = r.status_id as number;
      const elapsed = r.elapsed as string | null;
      const comment = r.comment as string | null;
      const durationMs = parseElapsed(elapsed);

      normalizedResults.push({
        testExternalId: String(caseId),
        testTitle: test ? (test.title as string) : `Case ${caseId}`,
        status: STATUS_MAP[statusId] || 'SKIPPED',
        ...(durationMs !== undefined && { durationMs }),
        ...(comment && { errorMessage: comment }),
      });
    }

    const hasFailed = normalizedResults.some(
      (r) => r.status === 'FAILED' || r.status === 'ERROR',
    );
    const completedOn = run.completed_on as number | null;
    const isCompleted = run.is_completed as boolean;

    let runStatus: NormalizedTestRun['status'];
    if (!isCompleted) {
      runStatus = 'RUNNING';
    } else if (hasFailed) {
      runStatus = 'FAILED';
    } else {
      runStatus = 'PASSED';
    }

    const runName = run.name as string;
    const displayName = planName ? `${planName} / ${runName}` : runName;

    return {
      externalId: String(runId),
      name: displayName,
      triggerType: 'MANUAL',
      startedAt: new Date((run.created_on as number) * 1000),
      finishedAt: completedOn ? new Date(completedOn * 1000) : undefined,
      status: runStatus,
      results: normalizedResults,
    };
  }

  async fetchTestRuns(config: ConnectorConfig, since?: Date): Promise<NormalizedTestRun[]> {
    const creds = this.getCredentials(config);
    const projectId = creds.projectId;
    const sinceUnix = since ? Math.floor(since.getTime() / 1000) : undefined;

    // 1. Fetch standalone runs
    let runsPath = `get_runs/${projectId}`;
    if (sinceUnix) {
      runsPath += `&created_after=${sinceUnix}`;
    }
    const standaloneRuns = await this.fetchPaginated<Record<string, unknown>>(creds, runsPath, 'runs');
    this.logger.log(`Found ${standaloneRuns.length} standalone runs`);

    // 2. Fetch test plans and extract runs from each plan
    let plansPath = `get_plans/${projectId}`;
    if (sinceUnix) {
      plansPath += `&created_after=${sinceUnix}`;
    }
    const plans = await this.fetchPaginated<Record<string, unknown>>(creds, plansPath, 'plans');
    this.logger.log(`Found ${plans.length} test plans`);

    const planRuns: { run: Record<string, unknown>; planName: string }[] = [];
    for (let i = 0; i < plans.length; i++) {
      const plan = plans[i];
      this.logger.log(`Loading plan ${i + 1}/${plans.length}: ${plan.name}`);
      const fullPlan = await this.request<Record<string, unknown>>(
        creds,
        `get_plan/${plan.id}`,
      );
      const entries = (fullPlan.entries as any[]) || [];
      for (const entry of entries) {
        const runs = (entry.runs as Record<string, unknown>[]) || [];
        for (const run of runs) {
          planRuns.push({ run, planName: plan.name as string });
        }
      }
    }
    this.logger.log(`Total runs to normalize: ${standaloneRuns.length} standalone + ${planRuns.length} from plans`);

    // 3. Normalize all runs (fetch results + tests for each)
    const normalizedRuns: NormalizedTestRun[] = [];
    const totalRuns = standaloneRuns.length + planRuns.length;
    let processed = 0;

    for (const run of standaloneRuns) {
      processed++;
      this.logger.log(`Normalizing run ${processed}/${totalRuns}: ${run.name} (id: ${run.id})`);
      normalizedRuns.push(await this.normalizeRun(creds, run));
    }

    for (const { run, planName } of planRuns) {
      processed++;
      this.logger.log(`Normalizing run ${processed}/${totalRuns}: ${planName} / ${run.name} (id: ${run.id})`);
      normalizedRuns.push(await this.normalizeRun(creds, run, planName));
    }

    return normalizedRuns;
  }
}
