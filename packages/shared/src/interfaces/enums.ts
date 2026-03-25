// Canonical status enums — single source of truth for API + Web + Demo

export const TEST_RUN_STATUSES = ['QUEUED', 'RUNNING', 'PASSED', 'FAILED', 'CANCELLED', 'ERRORED'] as const;
export type TestRunStatus = (typeof TEST_RUN_STATUSES)[number];

export const TEST_RESULT_STATUSES = ['PASSED', 'FAILED', 'SKIPPED', 'ERROR', 'FLAKY'] as const;
export type TestResultStatus = (typeof TEST_RESULT_STATUSES)[number];

export const PIPELINE_STATUSES = ['QUEUED', 'IN_PROGRESS', 'SUCCESS', 'FAILURE', 'CANCELLED'] as const;
export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

export const DEFECT_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED'] as const;
export type DefectStatus = (typeof DEFECT_STATUSES)[number];

export const DEFECT_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type DefectSeverity = (typeof DEFECT_SEVERITIES)[number];

export const STORY_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED'] as const;
export type StoryStatus = (typeof STORY_STATUSES)[number];

export const CONNECTOR_TYPES = ['GITHUB', 'TESTRAIL', 'JIRA', 'JUNIT_XML', 'TESTNG_XML'] as const;
export type ConnectorType = (typeof CONNECTOR_TYPES)[number];

export const CONNECTOR_STATUSES = ['ACTIVE', 'PAUSED', 'ERROR', 'SYNCING'] as const;
export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];
