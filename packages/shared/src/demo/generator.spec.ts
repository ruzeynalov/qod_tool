import { describe, it, expect } from 'vitest';
import { generateDemoData, DEFAULT_DEMO_CONFIG, DemoConfig, DemoDataSet } from './generator';

describe('generateDemoData', () => {
  it('returns a DemoDataSet with all expected top-level keys', () => {
    const data = generateDemoData();
    const keys: Array<keyof DemoDataSet> = [
      'featureAreas',
      'testCases',
      'testRuns',
      'defects',
      'stories',
      'pipelineRuns',
      'kpiSnapshots',
    ];
    for (const key of keys) {
      expect(data).toHaveProperty(key);
      expect(Array.isArray(data[key])).toBe(true);
    }
  });

  it('generates the correct number of feature areas from config', () => {
    const data = generateDemoData();
    expect(data.featureAreas).toHaveLength(DEFAULT_DEMO_CONFIG.featureAreas.length);
  });

  it('generates feature areas with required fields', () => {
    const data = generateDemoData();
    for (const fa of data.featureAreas) {
      expect(fa.id).toBeDefined();
      expect(typeof fa.id).toBe('string');
      expect(fa.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(fa.name).toBeDefined();
      expect(fa.color).toBeDefined();
    }
  });

  it('generates the correct number of test cases', () => {
    const data = generateDemoData();
    expect(data.testCases).toHaveLength(DEFAULT_DEMO_CONFIG.testCaseCount);
  });

  it('generates test cases with valid fields', () => {
    const data = generateDemoData();
    const featureAreaIds = new Set(data.featureAreas.map(fa => fa.id));
    for (const tc of data.testCases) {
      expect(tc.id).toBeDefined();
      expect(tc.externalId).toMatch(/^TC-\d+$/);
      expect(tc.title).toBeDefined();
      expect(['MANUAL', 'AUTOMATED', 'BDD']).toContain(tc.type);
      expect(['AUTOMATED', 'NOT_AUTOMATED', 'NEEDS_UPDATE']).toContain(tc.automationStatus);
      expect(featureAreaIds.has(tc.featureAreaId)).toBe(true);
      expect(Array.isArray(tc.tags)).toBe(true);
      expect(tc.suiteName).toBeDefined();
    }
  });

  it('generates the correct number of defects', () => {
    const data = generateDemoData();
    expect(data.defects).toHaveLength(DEFAULT_DEMO_CONFIG.defectCount);
  });

  it('generates defects with valid severity and priority', () => {
    const data = generateDemoData();
    for (const defect of data.defects) {
      expect(defect.id).toBeDefined();
      expect(defect.externalId).toMatch(/^BUG-\d+$/);
      expect(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).toContain(defect.severity);
      expect(['P0', 'P1', 'P2', 'P3']).toContain(defect.priority);
      expect(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED']).toContain(defect.status);
      expect(defect.createdAt).toBeInstanceOf(Date);
      expect(Array.isArray(defect.changelog)).toBe(true);
    }
  });

  it('generates test runs with results', () => {
    const data = generateDemoData();
    expect(data.testRuns.length).toBeGreaterThan(0);
    for (const run of data.testRuns) {
      expect(run.id).toBeDefined();
      expect(['PASSED', 'FAILED']).toContain(run.status);
      expect(run.totalTests).toBe(run.results.length);
      expect(run.passedCount + run.failedCount + run.skippedCount + run.flakyCount + run.erroredCount)
        .toBe(run.totalTests);
      expect(run.startedAt).toBeInstanceOf(Date);
      expect(run.durationMs).toBeGreaterThanOrEqual(0);
      expect(run.pipelineRunId).toBeDefined();
    }
  });

  it('generates pipeline runs matching test runs', () => {
    const data = generateDemoData();
    const pipelineIds = new Set(data.pipelineRuns.map(pr => pr.id));
    for (const run of data.testRuns) {
      expect(pipelineIds.has(run.pipelineRunId)).toBe(true);
    }
  });

  it('generates stories with valid fields', () => {
    const data = generateDemoData();
    expect(data.stories.length).toBeGreaterThan(0);
    for (const story of data.stories) {
      expect(story.id).toBeDefined();
      expect(story.externalId).toMatch(/^PS-\d+$/);
      expect(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED']).toContain(story.status);
      expect(story.createdAt).toBeInstanceOf(Date);
      expect(Array.isArray(story.labels)).toBe(true);
    }
  });

  it('generates KPI snapshots for all metric types', () => {
    const data = generateDemoData();
    expect(data.kpiSnapshots.length).toBeGreaterThan(0);
    const metrics = new Set(data.kpiSnapshots.map(s => s.metric));
    expect(metrics).toContain('COVERAGE_PCT');
    expect(metrics).toContain('PASS_RATE_7D');
    expect(metrics).toContain('FLAKY_RATE');
    expect(metrics).toContain('MTTD_HOURS');
    expect(metrics).toContain('MTTR_HOURS');
    for (const snapshot of data.kpiSnapshots) {
      expect(snapshot.id).toBeDefined();
      expect(typeof snapshot.value).toBe('number');
      expect(typeof snapshot.target).toBe('number');
      expect(snapshot.recordedAt).toBeInstanceOf(Date);
    }
  });

  it('is deterministic — same seed produces identical output', () => {
    const data1 = generateDemoData();
    const data2 = generateDemoData();
    expect(data1.featureAreas).toEqual(data2.featureAreas);
    expect(data1.testCases.length).toBe(data2.testCases.length);
    expect(data1.testCases[0].id).toBe(data2.testCases[0].id);
    expect(data1.defects.length).toBe(data2.defects.length);
    expect(data1.defects[0].id).toBe(data2.defects[0].id);
  });

  it('produces different output for different seeds', () => {
    const config1: DemoConfig = { ...DEFAULT_DEMO_CONFIG, seed: 1 };
    const config2: DemoConfig = { ...DEFAULT_DEMO_CONFIG, seed: 2 };
    const data1 = generateDemoData(config1);
    const data2 = generateDemoData(config2);
    expect(data1.featureAreas[0].id).not.toBe(data2.featureAreas[0].id);
  });

  it('respects custom config values', () => {
    const config: DemoConfig = {
      projectName: 'Custom',
      seed: 99,
      daysOfHistory: 5,
      testCaseCount: 10,
      featureAreas: ['A', 'B'],
      avgRunsPerDay: 2,
      defectCount: 3,
      flakyTestPct: 0.1,
      passRateMean: 0.9,
    };
    const data = generateDemoData(config);
    expect(data.featureAreas).toHaveLength(2);
    expect(data.featureAreas[0].name).toBe('A');
    expect(data.featureAreas[1].name).toBe('B');
    expect(data.testCases).toHaveLength(10);
    expect(data.defects).toHaveLength(3);
  });

  it('marks re-runs correctly', () => {
    const data = generateDemoData();
    const reruns = data.testRuns.filter(r => r.isRerun);
    for (const rerun of reruns) {
      expect(rerun.isRerun).toBe(true);
      expect(rerun.originalRunId).toBeDefined();
      expect(rerun.name).toContain('(re-run)');
    }
    const nonReruns = data.testRuns.filter(r => !r.isRerun);
    for (const run of nonReruns) {
      expect(run.originalRunId).toBeNull();
    }
  });

  it('generates valid UUIDs (v4 format) for all entities', () => {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const config: DemoConfig = {
      ...DEFAULT_DEMO_CONFIG,
      daysOfHistory: 3,
      testCaseCount: 5,
      defectCount: 3,
      avgRunsPerDay: 1,
    };
    const data = generateDemoData(config);
    for (const fa of data.featureAreas) {
      expect(fa.id).toMatch(uuidPattern);
    }
    for (const tc of data.testCases) {
      expect(tc.id).toMatch(uuidPattern);
    }
    for (const d of data.defects) {
      expect(d.id).toMatch(uuidPattern);
    }
  });

  it('generates test result counts that match result array statuses', () => {
    const data = generateDemoData();
    for (const run of data.testRuns) {
      const passed = run.results.filter(r => r.status === 'PASSED').length;
      const failed = run.results.filter(r => r.status === 'FAILED').length;
      const skipped = run.results.filter(r => r.status === 'SKIPPED').length;
      const flaky = run.results.filter(r => r.status === 'FLAKY').length;
      expect(run.passedCount).toBe(passed);
      expect(run.failedCount).toBe(failed);
      expect(run.skippedCount).toBe(skipped);
      expect(run.flakyCount).toBe(flaky);
    }
  });
});
