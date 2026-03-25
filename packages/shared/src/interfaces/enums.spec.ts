import { describe, it, expect } from 'vitest';
import {
  TEST_RUN_STATUSES,
  TEST_RESULT_STATUSES,
  PIPELINE_STATUSES,
  DEFECT_STATUSES,
  DEFECT_SEVERITIES,
  STORY_STATUSES,
  CONNECTOR_TYPES,
  CONNECTOR_STATUSES,
} from './enums';

describe('Shared enums', () => {
  it('TEST_RUN_STATUSES contains expected values', () => {
    expect(TEST_RUN_STATUSES).toContain('QUEUED');
    expect(TEST_RUN_STATUSES).toContain('RUNNING');
    expect(TEST_RUN_STATUSES).toContain('PASSED');
    expect(TEST_RUN_STATUSES).toContain('FAILED');
    expect(TEST_RUN_STATUSES).toContain('CANCELLED');
    expect(TEST_RUN_STATUSES).toContain('ERRORED');
    expect(TEST_RUN_STATUSES).toHaveLength(6);
  });

  it('TEST_RESULT_STATUSES contains expected values', () => {
    expect(TEST_RESULT_STATUSES).toContain('PASSED');
    expect(TEST_RESULT_STATUSES).toContain('FAILED');
    expect(TEST_RESULT_STATUSES).toContain('SKIPPED');
    expect(TEST_RESULT_STATUSES).toContain('ERROR');
    expect(TEST_RESULT_STATUSES).toContain('FLAKY');
    expect(TEST_RESULT_STATUSES).toHaveLength(5);
  });

  it('PIPELINE_STATUSES contains expected values', () => {
    expect(PIPELINE_STATUSES).toContain('QUEUED');
    expect(PIPELINE_STATUSES).toContain('IN_PROGRESS');
    expect(PIPELINE_STATUSES).toContain('SUCCESS');
    expect(PIPELINE_STATUSES).toContain('FAILURE');
    expect(PIPELINE_STATUSES).toContain('CANCELLED');
    expect(PIPELINE_STATUSES).toHaveLength(5);
  });

  it('DEFECT_STATUSES contains expected values', () => {
    expect(DEFECT_STATUSES).toContain('OPEN');
    expect(DEFECT_STATUSES).toContain('IN_PROGRESS');
    expect(DEFECT_STATUSES).toContain('RESOLVED');
    expect(DEFECT_STATUSES).toContain('CLOSED');
    expect(DEFECT_STATUSES).toContain('REOPENED');
    expect(DEFECT_STATUSES).toHaveLength(5);
  });

  it('DEFECT_SEVERITIES contains expected values', () => {
    expect(DEFECT_SEVERITIES).toContain('CRITICAL');
    expect(DEFECT_SEVERITIES).toContain('HIGH');
    expect(DEFECT_SEVERITIES).toContain('MEDIUM');
    expect(DEFECT_SEVERITIES).toContain('LOW');
    expect(DEFECT_SEVERITIES).toHaveLength(4);
  });

  it('STORY_STATUSES matches DEFECT_STATUSES', () => {
    expect([...STORY_STATUSES]).toEqual([...DEFECT_STATUSES]);
  });

  it('CONNECTOR_TYPES contains all supported connectors', () => {
    expect(CONNECTOR_TYPES).toContain('GITHUB');
    expect(CONNECTOR_TYPES).toContain('TESTRAIL');
    expect(CONNECTOR_TYPES).toContain('JIRA');
    expect(CONNECTOR_TYPES).toContain('JUNIT_XML');
    expect(CONNECTOR_TYPES).toContain('TESTNG_XML');
    expect(CONNECTOR_TYPES).toHaveLength(5);
  });

  it('CONNECTOR_STATUSES contains expected values', () => {
    expect(CONNECTOR_STATUSES).toContain('ACTIVE');
    expect(CONNECTOR_STATUSES).toContain('PAUSED');
    expect(CONNECTOR_STATUSES).toContain('ERROR');
    expect(CONNECTOR_STATUSES).toContain('SYNCING');
    expect(CONNECTOR_STATUSES).toHaveLength(4);
  });

  it('all enum arrays are plain arrays (as const provides compile-time readonly)', () => {
    // `as const` makes these readonly at the TypeScript level, but they are
    // regular arrays at runtime. Verify they are arrays with correct contents.
    expect(Array.isArray(TEST_RUN_STATUSES)).toBe(true);
    expect(Array.isArray(DEFECT_SEVERITIES)).toBe(true);
    expect(Array.isArray(CONNECTOR_TYPES)).toBe(true);
  });
});
