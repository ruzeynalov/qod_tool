import { vi } from 'vitest';
import type { KPIMetricKey, ResolvedFormulaConfig } from '@qod/shared';
import { createPrismaMock, PrismaMock } from '../../common/utils/prisma-mock';
import { AggregationService } from './aggregation.service';
import { PrismaService } from '../../database/prisma.service';
import {
  buildResolvedConfig,
  KPI_FORMULA_DEFINITIONS,
} from '../kpi/kpi-formula.definitions';
import { KPIFormulaService } from '../kpi/kpi-formula.service';

const projectId = 'proj-uuid-1';

function defaults(metric: KPIMetricKey): ResolvedFormulaConfig {
  return buildResolvedConfig(metric, null);
}

function defaultsAll(): Record<KPIMetricKey, ResolvedFormulaConfig> {
  const out = {} as Record<KPIMetricKey, ResolvedFormulaConfig>;
  for (const key of Object.keys(KPI_FORMULA_DEFINITIONS) as KPIMetricKey[]) {
    out[key] = defaults(key);
  }
  return out;
}

function mockFormulaService(): KPIFormulaService {
  return {
    resolveAll: vi.fn().mockResolvedValue(defaultsAll()),
    resolve: vi.fn(async (_p: string, m: KPIMetricKey) => defaults(m)),
    upsert: vi.fn(),
    reset: vi.fn(),
    validate: vi.fn(),
    getFormulaChangePoints: vi.fn().mockResolvedValue({}),
  } as unknown as KPIFormulaService;
}

describe('AggregationService', () => {
  let service: AggregationService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new AggregationService(
      prisma as unknown as PrismaService,
      mockFormulaService(),
    );
  });

  describe('computeCoveragePct()', () => {
    it('default expression evaluates to (automated / total) × 100', async () => {
      prisma.testCase.groupBy.mockResolvedValue([
        { automationStatus: 'AUTOMATED', _count: { _all: 80 } },
        { automationStatus: 'NOT_AUTOMATED', _count: { _all: 20 } },
      ]);

      const result = await service.computeCoveragePct(projectId, defaults('COVERAGE_PCT'));

      expect(result.value).toBe(80);
      expect(result.breakdown).toEqual({
        automatedCount: 80,
        notAutomatedCount: 20,
        needsUpdateCount: 0,
        totalTestCases: 100,
      });
    });

    it('honors a custom expression that combines variables', async () => {
      prisma.testCase.groupBy.mockResolvedValue([
        { automationStatus: 'AUTOMATED', _count: { _all: 50 } },
        { automationStatus: 'NEEDS_UPDATE', _count: { _all: 10 } },
        { automationStatus: 'NOT_AUTOMATED', _count: { _all: 40 } },
      ]);

      const cfg: ResolvedFormulaConfig = {
        ...defaults('COVERAGE_PCT'),
        expression: '100 * (automatedCount + needsUpdateCount) / totalTestCases',
      };

      const result = await service.computeCoveragePct(projectId, cfg);
      expect(result.value).toBe(60);
    });
  });

  describe('computePassRate()', () => {
    it('produces per-status counts and evaluates the default expression', async () => {
      prisma.testResult.groupBy.mockResolvedValue([
        { status: 'PASSED', _count: { _all: 950 } },
        { status: 'FAILED', _count: { _all: 50 } },
      ]);

      const result = await service.computePassRate(projectId, defaults('PASS_RATE_7D'));

      expect(result.value).toBe(95);
      expect(result.breakdown.passedResults).toBe(950);
      expect(result.breakdown.failedResults).toBe(50);
      expect(result.breakdown.totalResults).toBe(1000);
    });

    it('lets the user count FLAKY toward the numerator', async () => {
      prisma.testResult.groupBy.mockResolvedValue([
        { status: 'PASSED', _count: { _all: 80 } },
        { status: 'FLAKY', _count: { _all: 10 } },
        { status: 'FAILED', _count: { _all: 10 } },
      ]);

      const cfg: ResolvedFormulaConfig = {
        ...defaults('PASS_RATE_7D'),
        expression: '100 * (passedResults + flakyResults) / totalResults',
      };

      const result = await service.computePassRate(projectId, cfg);
      expect(result.value).toBe(90);
    });
  });

  describe('computeFlakyRate()', () => {
    it('detects flaky tests using minTransitions and exposes counts', async () => {
      prisma.testRun.findMany.mockResolvedValueOnce([
        { id: 'r1', startedAt: new Date(2026, 0, 5) },
        { id: 'r2', startedAt: new Date(2026, 0, 4) },
        { id: 'r3', startedAt: new Date(2026, 0, 3) },
      ]);
      prisma.testCase.findMany.mockResolvedValueOnce([
        {
          id: 'tc-1',
          testResults: [
            { status: 'PASSED', runId: 'r1' },
            { status: 'FAILED', runId: 'r2' },
            { status: 'PASSED', runId: 'r3' },
          ],
        },
        {
          id: 'tc-2',
          testResults: [
            { status: 'PASSED', runId: 'r1' },
            { status: 'PASSED', runId: 'r2' },
          ],
        },
      ]);

      const result = await service.computeFlakyRate(projectId, defaults('FLAKY_RATE'));
      expect(result.value).toBe(50);
      expect(result.breakdown).toEqual({ flakyTestCount: 1, automatedTestCount: 2, runCount: 3 });
    });

    it('counts a single FLAKY result row as flaky (no PASS↔FAIL transitions required)', async () => {
      // The GitHub connector emits FLAKY when within-run retries disagree;
      // the FLAKY_RATE KPI must surface that the same way getFlakyTests does,
      // otherwise the dashboard widget and the KPI/alert engine disagree.
      prisma.testRun.findMany.mockResolvedValueOnce([
        { id: 'r1', startedAt: new Date(2026, 0, 5) },
        { id: 'r2', startedAt: new Date(2026, 0, 4) },
        { id: 'r3', startedAt: new Date(2026, 0, 3) },
      ]);
      prisma.testCase.findMany.mockResolvedValueOnce([
        {
          id: 'tc-flaky',
          testResults: [
            { status: 'PASSED', runId: 'r1' },
            { status: 'FLAKY', runId: 'r2' },
            { status: 'PASSED', runId: 'r3' },
          ],
        },
        {
          id: 'tc-stable',
          testResults: [
            { status: 'PASSED', runId: 'r1' },
            { status: 'PASSED', runId: 'r2' },
            { status: 'PASSED', runId: 'r3' },
          ],
        },
      ]);

      const result = await service.computeFlakyRate(projectId, defaults('FLAKY_RATE'));
      expect(result.value).toBe(50);
      expect(result.breakdown).toEqual({ flakyTestCount: 1, automatedTestCount: 2, runCount: 3 });
    });
  });

  describe('computeMTTD()', () => {
    it('exposes mean and median latencies', async () => {
      prisma.testRun.findMany.mockResolvedValue([
        {
          id: 'r1',
          startedAt: new Date('2026-03-01T10:00:00Z'),
          testResults: [{ status: 'FAILED', createdAt: new Date('2026-03-01T11:00:00Z') }], // 1h
        },
        {
          id: 'r2',
          startedAt: new Date('2026-03-02T10:00:00Z'),
          testResults: [{ status: 'FAILED', createdAt: new Date('2026-03-02T12:00:00Z') }], // 2h
        },
        {
          id: 'r3',
          startedAt: new Date('2026-03-03T10:00:00Z'),
          testResults: [{ status: 'FAILED', createdAt: new Date('2026-03-03T20:00:00Z') }], // 10h
        },
      ]);

      const meanRes = await service.computeMTTD(projectId, defaults('MTTD_HOURS'));
      expect(meanRes.value).toBeCloseTo(13 / 3, 5);
      expect(meanRes.breakdown.medianFailureLatencyHours).toBe(2);

      const medianCfg: ResolvedFormulaConfig = {
        ...defaults('MTTD_HOURS'),
        expression: 'medianFailureLatencyHours',
      };
      const medianRes = await service.computeMTTD(projectId, medianCfg);
      expect(medianRes.value).toBe(2);
    });
  });

  describe('computeMTTR()', () => {
    it('exposes mean, median, and p90 resolution hours', async () => {
      prisma.defect.findMany.mockResolvedValue([
        { createdAt: new Date('2026-03-01T00:00:00Z'), resolvedAt: new Date('2026-03-02T00:00:00Z') },
        { createdAt: new Date('2026-03-01T00:00:00Z'), resolvedAt: new Date('2026-03-02T12:00:00Z') },
        { createdAt: new Date('2026-03-01T00:00:00Z'), resolvedAt: new Date('2026-04-01T00:00:00Z') }, // outlier
      ]);

      const result = await service.computeMTTR(projectId, defaults('MTTR_HOURS'));
      expect(result.value).toBe(36);
      expect(result.breakdown.resolvedDefectCount).toBe(3);
      expect(result.breakdown.p90ResolutionHours).toBeGreaterThan(36);
    });
  });

  describe('computeEscapeRate()', () => {
    it('default expression evaluates to escaped/total × 100', async () => {
      prisma.defect.count.mockResolvedValueOnce(5).mockResolvedValueOnce(50);
      const result = await service.computeEscapeRate(projectId, defaults('ESCAPE_RATE'));
      expect(result.value).toBe(10);
      expect(result.breakdown).toEqual({ escapedDefectCount: 5, totalDefectCount: 50 });
    });
  });

  describe('computeExecVelocity()', () => {
    it('evaluates runCount / windowDays', async () => {
      prisma.testRun.count.mockResolvedValue(70);
      const result = await service.computeExecVelocity(projectId, defaults('EXEC_VELOCITY'));
      expect(result.value).toBe(10);
      expect(result.breakdown).toEqual({ runCount: 70, windowDays: 7 });
    });
  });

  describe('computeReqCoverage()', () => {
    it('extracts story keys via the configured regex and exposes coverage counts', async () => {
      prisma.story.findMany.mockResolvedValue([
        { externalId: 'PS-100' },
        { externalId: 'PS-200' },
        { externalId: 'PS-300' },
        { externalId: 'PS-400' },
      ]);
      prisma.testCase.findMany.mockResolvedValue([
        { references: 'PS-100, PS-200' },
        { references: 'PS-300' },
      ]);

      const result = await service.computeReqCoverage(projectId, defaults('REQ_COVERAGE'));
      expect(result.value).toBe(75);
      expect(result.breakdown).toEqual({
        coveredStoryCount: 3,
        uncoveredStoryCount: 1,
        totalStoryCount: 4,
      });
    });
  });

  describe('computeDefectDensity()', () => {
    it('uses configured open statuses to count', async () => {
      prisma.defect.count.mockResolvedValueOnce(4);
      prisma.testCase.count.mockResolvedValueOnce(80);
      const result = await service.computeDefectDensity(projectId, defaults('DEFECT_DENSITY'));
      expect(result.value).toBe(5);
      expect(prisma.defect.count).toHaveBeenCalledWith({
        where: {
          projectId,
          deletedAt: null,
          status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] },
        },
      });
    });
  });

  describe('computeReadinessScore()', () => {
    function setupComputes() {
      // PASS_RATE_7D
      prisma.testResult.groupBy.mockResolvedValueOnce([
        { status: 'PASSED', _count: { _all: 90 } },
        { status: 'FAILED', _count: { _all: 10 } },
      ]);
      // PASS_RATE_30D
      prisma.testResult.groupBy.mockResolvedValueOnce([
        { status: 'PASSED', _count: { _all: 85 } },
        { status: 'FAILED', _count: { _all: 15 } },
      ]);
      // COVERAGE_PCT
      prisma.testCase.groupBy.mockResolvedValueOnce([
        { automationStatus: 'AUTOMATED', _count: { _all: 80 } },
        { automationStatus: 'NOT_AUTOMATED', _count: { _all: 20 } },
      ]);
      // FLAKY_RATE
      prisma.testRun.findMany.mockResolvedValueOnce([]);
      // MTTD
      prisma.testRun.findMany.mockResolvedValueOnce([]);
      // MTTR
      prisma.defect.findMany.mockResolvedValueOnce([]);
      // ESCAPE_RATE
      prisma.defect.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      // EXEC_VELOCITY
      prisma.testRun.count.mockResolvedValueOnce(7);
      // REQ_COVERAGE
      prisma.story.findMany.mockResolvedValueOnce([]);
      prisma.testCase.findMany.mockResolvedValueOnce([]);
      // DEFECT_DENSITY
      prisma.defect.count.mockResolvedValueOnce(0);
      prisma.testCase.count.mockResolvedValueOnce(100);
      // critical / total
      prisma.defect.count.mockResolvedValueOnce(2).mockResolvedValueOnce(100);
    }

    it('evaluates the default composite expression', async () => {
      setupComputes();
      const result = await service.computeReadinessScore(
        projectId,
        defaults('READINESS_SCORE'),
        defaultsAll(),
      );
      // 0.4 * 90 + 0.3 * 80 + 0.3 * (100 - 2) = 36 + 24 + 29.4 = 89.4
      expect(result.value).toBeCloseTo(89.4, 1);
    });

    it('honors a custom expression', async () => {
      setupComputes();
      const cfg = { ...defaults('READINESS_SCORE'), expression: '0.5 * passRate7d + 0.5 * coverage' };
      const result = await service.computeReadinessScore(projectId, cfg, defaultsAll());
      expect(result.value).toBeCloseTo(85, 1);
    });
  });

  describe('runAggregation()', () => {
    it('writes 11 KPISnapshot rows', async () => {
      prisma.testCase.count.mockResolvedValue(0);
      prisma.testResult.count.mockResolvedValue(0);
      prisma.testRun.count.mockResolvedValue(0);
      prisma.testRun.findMany.mockResolvedValue([]);
      prisma.testCase.findMany.mockResolvedValue([]);
      prisma.testCase.groupBy.mockResolvedValue([]);
      prisma.testResult.groupBy.mockResolvedValue([]);
      prisma.defect.count.mockResolvedValue(0);
      prisma.defect.findMany.mockResolvedValue([]);
      prisma.story.findMany.mockResolvedValue([]);
      prisma.kPISnapshot.createMany.mockResolvedValue({ count: 11 });

      await service.runAggregation(projectId);

      expect(prisma.kPISnapshot.createMany).toHaveBeenCalledTimes(1);
      const data = prisma.kPISnapshot.createMany.mock.calls[0][0].data;
      expect(data).toHaveLength(11);
      const metrics = data.map((d: any) => d.metric);
      for (const m of [
        'COVERAGE_PCT',
        'PASS_RATE_7D',
        'PASS_RATE_30D',
        'FLAKY_RATE',
        'MTTD_HOURS',
        'MTTR_HOURS',
        'ESCAPE_RATE',
        'EXEC_VELOCITY',
        'REQ_COVERAGE',
        'READINESS_SCORE',
        'DEFECT_DENSITY',
      ]) {
        expect(metrics).toContain(m);
      }
    });
  });
});
