// ─── IQODConnector — Plugin interface for all data source connectors ────

export type ConnectorCategory = 'tms' | 'issue_tracker' | 'ci' | 'scm' | 'report_upload';

export interface ConnectorConfig {
  id: string;
  connectorType: string;
  credentials: Record<string, unknown>;
  fieldMapping: Record<string, string>;
  syncSchedule: string;
  syncCursor?: Record<string, unknown>;
}

export interface AuthResult {
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>; // e.g. authenticated user info
}

export interface SyncResult {
  entitiesCreated: number;
  entitiesUpdated: number;
  errors: SyncError[];
  cursor?: Record<string, unknown>; // bookmark for next incremental sync
}

export interface SyncError {
  externalId?: string;
  entity: string;
  message: string;
}

export interface NormalizedTestCase {
  externalId: string;
  title: string;
  type: 'MANUAL' | 'AUTOMATED' | 'BDD';
  automationStatus: 'AUTOMATED' | 'NOT_AUTOMATED' | 'NEEDS_UPDATE';
  suiteName?: string;
  className?: string;
  filePath?: string;
  tags: string[];
  featureAreaMapping?: string; // external component/section name for mapping
  references?: string; // external refs (e.g. Jira tickets: "PS-2865")
  testRailType?: string; // TestRail case type name (e.g. "Regression")
}

export interface NormalizedTestRun {
  externalId: string;
  name?: string;
  triggerType: 'CI_PUSH' | 'PR' | 'SCHEDULE' | 'MANUAL' | 'WEBHOOK';
  branch?: string;
  sha?: string;
  environment?: string;
  startedAt: Date;
  finishedAt?: Date;
  durationMs?: number;
  status: 'QUEUED' | 'RUNNING' | 'PASSED' | 'FAILED' | 'CANCELLED' | 'ERRORED';
  results: NormalizedTestResult[];
  isRerun?: boolean;
  originalRunExternalId?: string;
  pipelineRunExternalId?: string;
  /**
   * Optional connector-supplied run-level counts. Used by SyncService when
   * `results` is empty — e.g. GitHub workflow runs whose Allure artifacts
   * are missing or use a non-default naming pattern. The connector can still
   * populate run totals from CI-level signals (shard/job conclusions) so
   * Run History shows non-zero stats even without per-test data.
   */
  summaryCounts?: {
    totalTests: number;
    passedCount: number;
    failedCount: number;
    skippedCount?: number;
    erroredCount?: number;
    flakyCount?: number;
  };
  /**
   * Where the run-level counts came from.
   * - `TEST_RESULTS` (default): counts derive from per-test rows in `results`.
   * - `CI_JOBS`: counts derive from CI signals (shard/job conclusions); the
   *   numbers represent shards, not test cases. UI / analytics that display
   *   "tests" should label these rows differently and exclude them from
   *   test-total averages.
   */
  countSource?: 'TEST_RESULTS' | 'CI_JOBS';
}

export interface NormalizedTestResult {
  testExternalId: string;
  testTitle: string;
  testClassName?: string;
  testSuiteName?: string;
  testFilePath?: string;
  status: 'PASSED' | 'FAILED' | 'SKIPPED' | 'ERROR' | 'FLAKY';
  durationMs?: number;
  errorMessage?: string;
  stackTrace?: string;
  retryIndex?: number;
}

export interface NormalizedDefect {
  externalId: string;
  title: string;
  url?: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'REOPENED';
  component?: string;
  assignee?: string;
  labels?: string[];
  isEscaped: boolean;
  reopenCount: number;
  createdAt: Date;
  resolvedAt?: Date;
  closedAt?: Date;
  changelog: StateTransition[];
  linkedTestExternalIds?: string[];
}

export interface StateTransition {
  from: string;
  to: string;
  at: Date;
  by?: string;
}

export interface NormalizedEpic {
  externalId: string;
  title: string;
  url?: string;
  status: string;
}

export interface NormalizedStory {
  externalId: string;
  title: string;
  url?: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'REOPENED';
  storyPoints?: number;
  assignee?: string;
  component?: string;
  labels: string[];
  epicKey?: string;
  createdAt: Date;
  resolvedAt?: Date;
  linkedTestExternalIds?: string[];
}

export interface NormalizedPipelineRun {
  externalId: string;
  workflowName: string;
  branch?: string;
  sha?: string;
  status: 'QUEUED' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE' | 'CANCELLED';
  durationMs?: number;
  triggeredBy?: string;
  startedAt: Date;
  finishedAt?: Date;
  url?: string;
  jobs: PipelineJob[];
}

export interface PipelineJob {
  name: string;
  status: string;
  durationMs?: number;
  steps?: PipelineStep[];
}

export interface PipelineStep {
  name: string;
  status: string;
  durationMs?: number;
}

export interface IQODConnector {
  readonly name: string;
  readonly type: ConnectorCategory;

  authenticate(config: ConnectorConfig): Promise<AuthResult>;
  testConnection(config: ConnectorConfig): Promise<AuthResult>;

  // TMS connectors
  fetchTestCases?(config: ConnectorConfig, since?: Date): Promise<NormalizedTestCase[]>;
  fetchTestRuns?(config: ConnectorConfig, since?: Date): Promise<NormalizedTestRun[]>;

  // Issue tracker connectors
  fetchDefects?(config: ConnectorConfig, since?: Date): Promise<NormalizedDefect[]>;
  fetchStories?(config: ConnectorConfig, since?: Date): Promise<NormalizedStory[]>;
  fetchEpics?(config: ConnectorConfig): Promise<NormalizedEpic[]>;

  // CI connectors
  fetchPipelineRuns?(config: ConnectorConfig, since?: Date): Promise<NormalizedPipelineRun[]>;

  // Webhook handler
  onWebhookEvent?(payload: unknown, headers: Record<string, string>): Promise<void>;
}

// Report upload connectors (JUnit XML, TestNG XML) use a different pattern:
// they receive file content rather than polling an API
export interface IReportUploadConnector {
  readonly name: string;
  readonly type: 'report_upload';

  parseReport(xmlContent: string): Promise<NormalizedTestRun>;
}
