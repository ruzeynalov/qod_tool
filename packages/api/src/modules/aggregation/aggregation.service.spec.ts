import { createPrismaMock, PrismaMock } from '../../common/utils/prisma-mock';
import { AggregationService } from './aggregation.service';
import { PrismaService } from '../../database/prisma.service';

describe('AggregationService', () => {
  let service: AggregationService;
  let prisma: PrismaMock;

  const projectId = 'proj-uuid-1';

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new AggregationService(prisma as unknown as PrismaService);
  });

  describe('computeCoveragePct()', () => {
    it('should compute coverage as (automated / total) * 100', async () => {
      prisma.testCase.count
        .mockResolvedValueOnce(80)   // automated count
        .mockResolvedValueOnce(100); // total count

      const result = await service.computeCoveragePct(projectId);

      expect(prisma.testCase.count).toHaveBeenCalledTimes(2);
      expect(prisma.testCase.count).toHaveBeenCalledWith({
        where: { projectId, automationStatus: 'AUTOMATED', deletedAt: null },
      });
      expect(prisma.testCase.count).toHaveBeenCalledWith({
        where: { projectId, deletedAt: null },
      });
      expect(result).toBe(80);
    });

    it('should return 0 when there are no test cases', async () => {
      prisma.testCase.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const result = await service.computeCoveragePct(projectId);

      expect(result).toBe(0);
    });

    it('should return 100 when all tests are automated', async () => {
      prisma.testCase.count
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(50);

      const result = await service.computeCoveragePct(projectId);

      expect(result).toBe(100);
    });
  });

  describe('computeDefectDensity()', () => {
    it('should compute open defects per 100 test cases', async () => {
      prisma.defect.count.mockResolvedValueOnce(4);
      prisma.testCase.count.mockResolvedValueOnce(80);

      const result = await service.computeDefectDensity(projectId);

      expect(prisma.defect.count).toHaveBeenCalledWith({
        where: {
          projectId,
          deletedAt: null,
          status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] },
        },
      });
      expect(prisma.testCase.count).toHaveBeenCalledWith({
        where: { projectId, deletedAt: null },
      });
      expect(result).toBe(5);
    });

    it('should return 0 when there are no test cases', async () => {
      prisma.defect.count.mockResolvedValueOnce(4);
      prisma.testCase.count.mockResolvedValueOnce(0);

      const result = await service.computeDefectDensity(projectId);

      expect(result).toBe(0);
    });
  });

  describe('computePassRate()', () => {
    it('should compute pass rate over last N days from TestResult counts', async () => {
      prisma.testResult.count
        .mockResolvedValueOnce(950)   // passed count
        .mockResolvedValueOnce(1000); // total count

      const result = await service.computePassRate(projectId, 7);

      expect(prisma.testResult.count).toHaveBeenCalledTimes(2);
      // Passed count call
      expect(prisma.testResult.count).toHaveBeenCalledWith({
        where: {
          testCase: { projectId, deletedAt: null },
          status: 'PASSED',
          createdAt: { gte: expect.any(Date) },
        },
      });
      // Total count call
      expect(prisma.testResult.count).toHaveBeenCalledWith({
        where: {
          testCase: { projectId, deletedAt: null },
          createdAt: { gte: expect.any(Date) },
        },
      });
      expect(result).toBe(95);
    });

    it('should return 0 when there are no results', async () => {
      prisma.testResult.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const result = await service.computePassRate(projectId, 7);

      expect(result).toBe(0);
    });
  });

  describe('computeFlakyRate()', () => {
    // Helper: mock run selection (single findMany call — uses all synced runs)
    const mockRuns = (runs: { id: string; startedAt: Date }[]) => {
      prisma.testRun.findMany.mockResolvedValueOnce(runs);
    };

    it('should detect flaky tests with 2+ transitions (fail then recover)', async () => {
      const runs = Array.from({ length: 5 }, (_, i) => ({
        id: `run-${i + 1}`,
        startedAt: new Date(2026, 2, 1, i),
      }));
      mockRuns(runs);

      // tc-1: P-F-P = 2 transitions → flaky (failed then recovered)
      // tc-2: all passed → not flaky
      // tc-3: all failed → not flaky (consistent failure = real bug)
      prisma.testCase.findMany.mockResolvedValueOnce([
        {
          id: 'tc-1',
          testResults: [
            { status: 'PASSED', runId: 'run-1' },
            { status: 'FAILED', runId: 'run-2' },
            { status: 'PASSED', runId: 'run-3' },
          ],
        },
        {
          id: 'tc-2',
          testResults: [
            { status: 'PASSED', runId: 'run-1' },
            { status: 'PASSED', runId: 'run-2' },
            { status: 'PASSED', runId: 'run-3' },
          ],
        },
        {
          id: 'tc-3',
          testResults: [
            { status: 'FAILED', runId: 'run-1' },
            { status: 'FAILED', runId: 'run-2' },
            { status: 'FAILED', runId: 'run-3' },
          ],
        },
      ]);

      const result = await service.computeFlakyRate(projectId);

      // 1 flaky out of 3 automated = 33.33
      expect(result).toBeCloseTo(33.33, 1);
    });

    it('should NOT flag a test with only 1 transition (pure regression)', async () => {
      const runs = Array.from({ length: 5 }, (_, i) => ({
        id: `run-${i + 1}`,
        startedAt: new Date(2026, 2, 1, i),
      }));
      mockRuns(runs);

      // P-P-P-F-F = 1 transition — regression, not flaky
      prisma.testCase.findMany.mockResolvedValueOnce([
        {
          id: 'tc-1',
          testResults: [
            { status: 'PASSED', runId: 'run-1' },
            { status: 'PASSED', runId: 'run-2' },
            { status: 'PASSED', runId: 'run-3' },
            { status: 'FAILED', runId: 'run-4' },
            { status: 'FAILED', runId: 'run-5' },
          ],
        },
      ]);

      const result = await service.computeFlakyRate(projectId);

      expect(result).toBe(0);
    });

    it('should use runs from all sources within 90-day window', async () => {
      const allRuns = [
        ...Array.from({ length: 7 }, (_, i) => ({
          id: `gh-${i + 1}`,
          startedAt: new Date(2026, 2, 5, i),
        })),
        ...Array.from({ length: 3 }, (_, i) => ({
          id: `tr-${i + 1}`,
          startedAt: new Date(2026, 2, 1, i),
        })),
      ];
      prisma.testRun.findMany.mockResolvedValueOnce(allRuns);

      prisma.testCase.findMany.mockResolvedValueOnce([]);

      await service.computeFlakyRate(projectId);

      // Single query fetches all runs regardless of source, with 90-day filter
      expect(prisma.testRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            projectId,
            deletedAt: null,
            startedAt: expect.objectContaining({ gte: expect.any(Date) }),
          }),
          orderBy: { startedAt: 'desc' },
        }),
      );
    });

    it('should return 0 when there are no recent runs', async () => {
      prisma.testRun.findMany.mockResolvedValueOnce([]);

      const result = await service.computeFlakyRate(projectId);

      expect(result).toBe(0);
    });

    it('should return 0 when no tests are flaky', async () => {
      const runs = [
        { id: 'run-1', startedAt: new Date(2026, 2, 1, 0) },
        { id: 'run-2', startedAt: new Date(2026, 2, 1, 1) },
      ];
      mockRuns(runs);

      prisma.testCase.findMany.mockResolvedValueOnce([
        {
          id: 'tc-1',
          testResults: [
            { status: 'PASSED', runId: 'run-1' },
            { status: 'PASSED', runId: 'run-2' },
          ],
        },
        {
          id: 'tc-2',
          testResults: [
            { status: 'FAILED', runId: 'run-1' },
            { status: 'FAILED', runId: 'run-2' },
          ],
        },
      ]);

      const result = await service.computeFlakyRate(projectId);

      expect(result).toBe(0);
    });
  });

  describe('computeMTTD()', () => {
    it('should compute average hours between commit timestamp and first failure detection', async () => {
      // TestRuns with sha (commit-triggered) that have failures
      const runs = [
        {
          id: 'run-1',
          startedAt: new Date('2026-03-01T10:00:00Z'),
          testResults: [
            { status: 'FAILED', createdAt: new Date('2026-03-01T12:00:00Z') },
          ],
        },
        {
          id: 'run-2',
          startedAt: new Date('2026-03-02T10:00:00Z'),
          testResults: [
            { status: 'FAILED', createdAt: new Date('2026-03-02T14:00:00Z') },
          ],
        },
      ];

      prisma.testRun.findMany.mockResolvedValue(runs);

      const result = await service.computeMTTD(projectId);

      // Run 1: 2 hours, Run 2: 4 hours => average = 3
      expect(result).toBe(3);
    });

    it('should return 0 when there are no runs with failures', async () => {
      prisma.testRun.findMany.mockResolvedValue([]);

      const result = await service.computeMTTD(projectId);

      expect(result).toBe(0);
    });
  });

  describe('computeMTTR()', () => {
    it('should compute average hours between defect createdAt and resolvedAt', async () => {
      const defects = [
        {
          createdAt: new Date('2026-03-01T00:00:00Z'),
          resolvedAt: new Date('2026-03-02T00:00:00Z'), // 24 hours
        },
        {
          createdAt: new Date('2026-03-01T00:00:00Z'),
          resolvedAt: new Date('2026-03-03T00:00:00Z'), // 48 hours
        },
      ];

      prisma.defect.findMany.mockResolvedValue(defects);

      const result = await service.computeMTTR(projectId);

      // Average: (24 + 48) / 2 = 36
      expect(result).toBe(36);
    });

    it('should return 0 when there are no resolved defects', async () => {
      prisma.defect.findMany.mockResolvedValue([]);

      const result = await service.computeMTTR(projectId);

      expect(result).toBe(0);
    });
  });

  describe('computeEscapeRate()', () => {
    it('should compute escaped defects / total defects * 100', async () => {
      prisma.defect.count
        .mockResolvedValueOnce(5)   // escaped count
        .mockResolvedValueOnce(50); // total count

      const result = await service.computeEscapeRate(projectId);

      expect(prisma.defect.count).toHaveBeenCalledWith({
        where: { projectId, isEscaped: true, deletedAt: null },
      });
      expect(prisma.defect.count).toHaveBeenCalledWith({
        where: { projectId, deletedAt: null },
      });
      expect(result).toBe(10);
    });

    it('should return 0 when there are no defects', async () => {
      prisma.defect.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const result = await service.computeEscapeRate(projectId);

      expect(result).toBe(0);
    });
  });

  describe('computeExecVelocity()', () => {
    it('should compute test runs per day over last N days', async () => {
      prisma.testRun.count.mockResolvedValue(70);

      const result = await service.computeExecVelocity(projectId, 7);

      expect(prisma.testRun.count).toHaveBeenCalledWith({
        where: {
          projectId,
          deletedAt: null,
          startedAt: { gte: expect.any(Date) },
        },
      });
      expect(result).toBe(10); // 70 / 7
    });

    it('should return 0 when there are no runs', async () => {
      prisma.testRun.count.mockResolvedValue(0);

      const result = await service.computeExecVelocity(projectId, 7);

      expect(result).toBe(0);
    });
  });

  describe('computeReqCoverage()', () => {
    it('should return 0 when there are no stories', async () => {
      prisma.story.findMany.mockResolvedValue([]);
      prisma.testCase.findMany.mockResolvedValue([]);

      const result = await service.computeReqCoverage(projectId);
      expect(result).toBe(0);
    });

    it('should compute percentage of stories covered by test case references', async () => {
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

      const result = await service.computeReqCoverage(projectId);
      expect(result).toBe(75); // 3 of 4 stories covered
    });
  });

  describe('computeReadinessScore()', () => {
    it('should compute weighted composite: 40% pass + 30% coverage + 30% (100 - critical ratio)', async () => {
      // Mock for computePassRate
      prisma.testResult.count
        .mockResolvedValueOnce(90)   // passed
        .mockResolvedValueOnce(100); // total

      // Mock for computeCoveragePct
      prisma.testCase.count
        .mockResolvedValueOnce(80)   // automated
        .mockResolvedValueOnce(100); // total

      // Mock for open critical defects
      prisma.defect.count
        .mockResolvedValueOnce(2)   // open critical
        .mockResolvedValueOnce(100); // total

      const result = await service.computeReadinessScore(projectId);

      // passRate = 90
      // coveragePct = 80
      // criticalRatio = (2/100)*100 = 2
      // readiness = 0.4 * 90 + 0.3 * 80 + 0.3 * (100 - 2) = 36 + 24 + 29.4 = 89.4
      expect(result).toBeCloseTo(89.4, 1);
    });

    it('should handle zero total defects in readiness score', async () => {
      prisma.testResult.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(100);

      prisma.testCase.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(100);

      prisma.defect.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const result = await service.computeReadinessScore(projectId);

      // passRate = 100, coverage = 100, criticalRatio = 0
      // readiness = 0.4 * 100 + 0.3 * 100 + 0.3 * 100 = 40 + 30 + 30 = 100
      expect(result).toBeCloseTo(100, 1);
    });
  });

  describe('runAggregation()', () => {
    it('should compute all KPIs and write KPISnapshot records', async () => {
      // Mock all compute methods' underlying prisma calls

      // computeCoveragePct
      prisma.testCase.count
        .mockResolvedValueOnce(80)   // automated
        .mockResolvedValueOnce(100)  // total
        // computeReadinessScore -> computeCoveragePct
        .mockResolvedValueOnce(80)
        .mockResolvedValueOnce(100);

      // computePassRate (7d)
      prisma.testResult.count
        .mockResolvedValueOnce(95)    // passed 7d
        .mockResolvedValueOnce(100)   // total 7d
        // computePassRate (30d)
        .mockResolvedValueOnce(92)
        .mockResolvedValueOnce(100)
        // computeReadinessScore -> computePassRate 7d
        .mockResolvedValueOnce(95)
        .mockResolvedValueOnce(100);

      // computeFlakyRate
      prisma.testCase.findMany.mockResolvedValue([]);

      // computeMTTD
      prisma.testRun.findMany.mockResolvedValue([]);

      // computeMTTR
      prisma.defect.findMany.mockResolvedValue([]);

      // computeEscapeRate + computeReadinessScore critical
      prisma.defect.count
        .mockResolvedValueOnce(5)    // escaped
        .mockResolvedValueOnce(50)   // total defects
        // computeReadinessScore
        .mockResolvedValueOnce(0)    // open critical
        .mockResolvedValueOnce(50);  // total defects

      // computeReqCoverage
      prisma.story.findMany.mockResolvedValue([]);

      // computeExecVelocity
      prisma.testRun.count.mockResolvedValue(70);

      // createMany for snapshots
      prisma.kPISnapshot.createMany.mockResolvedValue({ count: 11 });

      await service.runAggregation(projectId);

      expect(prisma.kPISnapshot.createMany).toHaveBeenCalledTimes(1);
      const createManyCall = prisma.kPISnapshot.createMany.mock.calls[0][0];
      expect(createManyCall.data).toBeInstanceOf(Array);
      expect(createManyCall.data.length).toBe(11); // 11 KPI metrics

      // Verify metrics are present
      const metrics = createManyCall.data.map((d: any) => d.metric);
      expect(metrics).toContain('COVERAGE_PCT');
      expect(metrics).toContain('PASS_RATE_7D');
      expect(metrics).toContain('PASS_RATE_30D');
      expect(metrics).toContain('FLAKY_RATE');
      expect(metrics).toContain('MTTD_HOURS');
      expect(metrics).toContain('MTTR_HOURS');
      expect(metrics).toContain('ESCAPE_RATE');
      expect(metrics).toContain('EXEC_VELOCITY');
      expect(metrics).toContain('REQ_COVERAGE');
      expect(metrics).toContain('READINESS_SCORE');
      expect(metrics).toContain('DEFECT_DENSITY');

      // Verify all records have the correct projectId
      for (const record of createManyCall.data) {
        expect(record.projectId).toBe(projectId);
        expect(typeof record.value).toBe('number');
      }
    });
  });
});
