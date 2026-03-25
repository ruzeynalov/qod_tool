import { createPrismaMock, PrismaMock } from '../../common/utils/prisma-mock';
import { ExportService } from './export.service';
import { PrismaService } from '../../database/prisma.service';

describe('ExportService', () => {
  let service: ExportService;
  let prisma: PrismaMock;

  const projectId = 'proj-uuid-1';

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new ExportService(prisma as unknown as PrismaService);
  });

  // ───────────────────────────────────────────────────
  // exportCSV — test-cases
  // ───────────────────────────────────────────────────
  describe('exportCSV(projectId, "test-cases")', () => {
    it('should return headers and data rows for test cases', async () => {
      const testCases = [
        {
          id: 'tc-1',
          title: 'Login test',
          type: 'AUTOMATED',
          automationStatus: 'AUTOMATED',
          featureArea: { name: 'Auth' },
          tags: ['smoke', 'login'],
          lastExecutedAt: new Date('2026-03-01T10:00:00Z'),
        },
        {
          id: 'tc-2',
          title: 'Signup flow',
          type: 'MANUAL',
          automationStatus: 'NOT_AUTOMATED',
          featureArea: null,
          tags: [],
          lastExecutedAt: null,
        },
      ];

      prisma.testCase.findMany.mockResolvedValue(testCases);

      const csv = await service.exportCSV(projectId, 'test-cases');

      const lines = csv.split('\n');
      expect(lines[0]).toBe('Title,Type,AutomationStatus,FeatureArea,Tags,LastExecuted');
      expect(lines[1]).toBe('Login test,AUTOMATED,AUTOMATED,Auth,"smoke,login",2026-03-01T10:00:00.000Z');
      expect(lines[2]).toBe('Signup flow,MANUAL,NOT_AUTOMATED,,,');
      expect(lines.length).toBe(3);
    });

    it('should return headers only when no test cases exist', async () => {
      prisma.testCase.findMany.mockResolvedValue([]);

      const csv = await service.exportCSV(projectId, 'test-cases');

      expect(csv).toBe('Title,Type,AutomationStatus,FeatureArea,Tags,LastExecuted');
    });

    it('should query Prisma with correct projectId and include featureArea', async () => {
      prisma.testCase.findMany.mockResolvedValue([]);

      await service.exportCSV(projectId, 'test-cases');

      expect(prisma.testCase.findMany).toHaveBeenCalledWith({
        where: { projectId, deletedAt: null },
        include: { featureArea: true },
      });
    });
  });

  // ───────────────────────────────────────────────────
  // exportCSV — test-runs
  // ───────────────────────────────────────────────────
  describe('exportCSV(projectId, "test-runs")', () => {
    it('should return headers and data rows for test runs', async () => {
      const testRuns = [
        {
          id: 'run-1',
          name: 'Nightly Suite',
          status: 'PASSED',
          branch: 'main',
          environment: 'staging',
          startedAt: new Date('2026-03-01T08:00:00Z'),
          durationMs: 120000,
          passedCount: 50,
          failedCount: 2,
          skippedCount: 3,
        },
      ];

      prisma.testRun.findMany.mockResolvedValue(testRuns);

      const csv = await service.exportCSV(projectId, 'test-runs');

      const lines = csv.split('\n');
      expect(lines[0]).toBe('Name,Status,Branch,Environment,StartedAt,Duration,Passed,Failed,Skipped');
      expect(lines[1]).toBe('Nightly Suite,PASSED,main,staging,2026-03-01T08:00:00.000Z,120000,50,2,3');
    });

    it('should return headers only when no test runs exist', async () => {
      prisma.testRun.findMany.mockResolvedValue([]);

      const csv = await service.exportCSV(projectId, 'test-runs');

      expect(csv).toBe('Name,Status,Branch,Environment,StartedAt,Duration,Passed,Failed,Skipped');
    });

    it('should handle null optional fields', async () => {
      const testRuns = [
        {
          id: 'run-2',
          name: null,
          status: 'RUNNING',
          branch: null,
          environment: null,
          startedAt: new Date('2026-03-02T12:00:00Z'),
          durationMs: null,
          passedCount: 0,
          failedCount: 0,
          skippedCount: 0,
        },
      ];

      prisma.testRun.findMany.mockResolvedValue(testRuns);

      const csv = await service.exportCSV(projectId, 'test-runs');

      const lines = csv.split('\n');
      expect(lines[1]).toBe(',RUNNING,,,2026-03-02T12:00:00.000Z,,0,0,0');
    });
  });

  // ───────────────────────────────────────────────────
  // exportCSV — defects
  // ───────────────────────────────────────────────────
  describe('exportCSV(projectId, "defects")', () => {
    it('should return headers and data rows for defects', async () => {
      const defects = [
        {
          id: 'd-1',
          externalId: 'JIRA-123',
          title: 'Button not clickable',
          severity: 'HIGH',
          priority: 'P1',
          status: 'OPEN',
          component: 'UI',
          createdAt: new Date('2026-02-15T09:00:00Z'),
          resolvedAt: null,
        },
        {
          id: 'd-2',
          externalId: 'JIRA-456',
          title: 'API returns 500',
          severity: 'CRITICAL',
          priority: 'P0',
          status: 'RESOLVED',
          component: 'Backend',
          createdAt: new Date('2026-02-20T14:00:00Z'),
          resolvedAt: new Date('2026-02-22T10:00:00Z'),
        },
      ];

      prisma.defect.findMany.mockResolvedValue(defects);

      const csv = await service.exportCSV(projectId, 'defects');

      const lines = csv.split('\n');
      expect(lines[0]).toBe('ExternalId,Title,Severity,Priority,Status,Component,CreatedAt,ResolvedAt');
      expect(lines[1]).toBe('JIRA-123,Button not clickable,HIGH,P1,OPEN,UI,2026-02-15T09:00:00.000Z,');
      expect(lines[2]).toBe('JIRA-456,API returns 500,CRITICAL,P0,RESOLVED,Backend,2026-02-20T14:00:00.000Z,2026-02-22T10:00:00.000Z');
    });

    it('should return headers only when no defects exist', async () => {
      prisma.defect.findMany.mockResolvedValue([]);

      const csv = await service.exportCSV(projectId, 'defects');

      expect(csv).toBe('ExternalId,Title,Severity,Priority,Status,Component,CreatedAt,ResolvedAt');
    });
  });

  // ───────────────────────────────────────────────────
  // exportCSV — kpi-snapshots
  // ───────────────────────────────────────────────────
  describe('exportCSV(projectId, "kpi-snapshots")', () => {
    it('should return headers and data rows for KPI snapshots', async () => {
      const snapshots = [
        {
          id: 'snap-1',
          metric: 'COVERAGE_PCT',
          value: 85.5,
          target: 90,
          recordedAt: new Date('2026-03-05T00:00:00Z'),
        },
        {
          id: 'snap-2',
          metric: 'PASS_RATE_7D',
          value: 97.2,
          target: null,
          recordedAt: new Date('2026-03-05T00:00:00Z'),
        },
      ];

      prisma.kPISnapshot.findMany.mockResolvedValue(snapshots);

      const csv = await service.exportCSV(projectId, 'kpi-snapshots');

      const lines = csv.split('\n');
      expect(lines[0]).toBe('Metric,Value,Target,RecordedAt');
      expect(lines[1]).toBe('COVERAGE_PCT,85.5,90,2026-03-05T00:00:00.000Z');
      expect(lines[2]).toBe('PASS_RATE_7D,97.2,,2026-03-05T00:00:00.000Z');
    });

    it('should return headers only when no snapshots exist', async () => {
      prisma.kPISnapshot.findMany.mockResolvedValue([]);

      const csv = await service.exportCSV(projectId, 'kpi-snapshots');

      expect(csv).toBe('Metric,Value,Target,RecordedAt');
    });
  });

  // ───────────────────────────────────────────────────
  // CSV escaping
  // ───────────────────────────────────────────────────
  describe('CSV escaping', () => {
    it('should escape values containing commas by wrapping in double quotes', async () => {
      const testCases = [
        {
          id: 'tc-1',
          title: 'Test login, signup, and logout',
          type: 'AUTOMATED',
          automationStatus: 'AUTOMATED',
          featureArea: { name: 'Auth, Security' },
          tags: ['smoke'],
          lastExecutedAt: null,
        },
      ];

      prisma.testCase.findMany.mockResolvedValue(testCases);

      const csv = await service.exportCSV(projectId, 'test-cases');

      const lines = csv.split('\n');
      expect(lines[1]).toContain('"Test login, signup, and logout"');
      expect(lines[1]).toContain('"Auth, Security"');
    });

    it('should escape values containing double quotes by doubling them', async () => {
      const testCases = [
        {
          id: 'tc-1',
          title: 'Test "special" characters',
          type: 'AUTOMATED',
          automationStatus: 'AUTOMATED',
          featureArea: null,
          tags: [],
          lastExecutedAt: null,
        },
      ];

      prisma.testCase.findMany.mockResolvedValue(testCases);

      const csv = await service.exportCSV(projectId, 'test-cases');

      const lines = csv.split('\n');
      expect(lines[1]).toContain('"Test ""special"" characters"');
    });

    it('should escape values containing newlines by wrapping in double quotes', async () => {
      const defects = [
        {
          id: 'd-1',
          externalId: 'BUG-1',
          title: 'Line one\nLine two',
          severity: 'LOW',
          priority: 'P3',
          status: 'OPEN',
          component: null,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          resolvedAt: null,
        },
      ];

      prisma.defect.findMany.mockResolvedValue(defects);

      const csv = await service.exportCSV(projectId, 'defects');

      // The row should contain the escaped title
      expect(csv).toContain('"Line one\nLine two"');
    });
  });

  // ───────────────────────────────────────────────────
  // exportCSV — invalid type
  // ───────────────────────────────────────────────────
  describe('exportCSV(projectId, "invalid-type")', () => {
    it('should throw an error for an unsupported type', async () => {
      await expect(service.exportCSV(projectId, 'invalid-type')).rejects.toThrow(
        'Unsupported export type: invalid-type',
      );
    });
  });

  // ───────────────────────────────────────────────────
  // exportProjectSummaryJSON
  // ───────────────────────────────────────────────────
  describe('exportProjectSummaryJSON()', () => {
    it('should return a summary JSON object with project stats', async () => {
      prisma.project.findUniqueOrThrow.mockResolvedValue({
        id: projectId,
        name: 'My QA Project',
      });

      prisma.testCase.count.mockResolvedValue(150);

      prisma.defect.count.mockResolvedValue(12);

      prisma.kPISnapshot.findFirst.mockResolvedValueOnce({
        metric: 'PASS_RATE_7D',
        value: 95.3,
      });
      prisma.kPISnapshot.findFirst.mockResolvedValueOnce({
        metric: 'COVERAGE_PCT',
        value: 87.5,
      });

      // Top flaky tests — testResults grouped by testCaseId
      prisma.testResult.groupBy.mockResolvedValue([
        { testCaseId: 'tc-1', _count: { id: 8 } },
        { testCaseId: 'tc-2', _count: { id: 5 } },
        { testCaseId: 'tc-3', _count: { id: 3 } },
      ]);

      prisma.testCase.findMany.mockResolvedValue([
        { id: 'tc-1', title: 'Flaky Login Test' },
        { id: 'tc-2', title: 'Flaky API Test' },
        { id: 'tc-3', title: 'Flaky Upload Test' },
      ]);

      prisma.testRun.findMany.mockResolvedValue([
        { id: 'run-1', name: 'Nightly', status: 'PASSED', startedAt: new Date('2026-03-05') },
        { id: 'run-2', name: 'PR Check', status: 'FAILED', startedAt: new Date('2026-03-04') },
      ]);

      const result = await service.exportProjectSummaryJSON(projectId);

      expect(result.projectName).toBe('My QA Project');
      expect(result.totalTestCases).toBe(150);
      expect(result.totalDefectsOpen).toBe(12);
      expect(result.passRate7d).toBe(95.3);
      expect(result.coveragePct).toBe(87.5);
      expect(result.topFlakyTests).toHaveLength(3);
      expect(result.topFlakyTests[0]).toEqual({
        testCaseId: 'tc-1',
        title: 'Flaky Login Test',
        flakyCount: 8,
      });
      expect(result.recentRuns).toHaveLength(2);
      expect(result.recentRuns[0].id).toBe('run-1');
    });

    it('should handle missing KPI snapshots gracefully', async () => {
      prisma.project.findUniqueOrThrow.mockResolvedValue({
        id: projectId,
        name: 'Empty Project',
      });

      prisma.testCase.count.mockResolvedValue(0);
      prisma.defect.count.mockResolvedValue(0);
      prisma.kPISnapshot.findFirst.mockResolvedValue(null);
      prisma.testResult.groupBy.mockResolvedValue([]);
      prisma.testCase.findMany.mockResolvedValue([]);
      prisma.testRun.findMany.mockResolvedValue([]);

      const result = await service.exportProjectSummaryJSON(projectId);

      expect(result.projectName).toBe('Empty Project');
      expect(result.totalTestCases).toBe(0);
      expect(result.totalDefectsOpen).toBe(0);
      expect(result.passRate7d).toBeNull();
      expect(result.coveragePct).toBeNull();
      expect(result.topFlakyTests).toEqual([]);
      expect(result.recentRuns).toEqual([]);
    });
  });

  // ───────────────────────────────────────────────────
  // generatePDFReport
  // ───────────────────────────────────────────────────
  describe('generatePDFReport()', () => {
    it('should return a Buffer', async () => {
      // Mock all the data that exportProjectSummaryJSON needs
      prisma.project.findUniqueOrThrow.mockResolvedValue({
        id: projectId,
        name: 'PDF Project',
      });
      prisma.testCase.count.mockResolvedValue(100);
      prisma.defect.count.mockResolvedValue(5);
      prisma.kPISnapshot.findFirst.mockResolvedValueOnce({
        metric: 'PASS_RATE_7D',
        value: 92.0,
      });
      prisma.kPISnapshot.findFirst.mockResolvedValueOnce({
        metric: 'COVERAGE_PCT',
        value: 80.0,
      });
      prisma.testResult.groupBy.mockResolvedValue([]);
      prisma.testCase.findMany.mockResolvedValue([]);
      prisma.testRun.findMany.mockResolvedValue([]);

      const buffer = await service.generatePDFReport(projectId);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should contain the project name in the report content', async () => {
      prisma.project.findUniqueOrThrow.mockResolvedValue({
        id: projectId,
        name: 'Report Test Project',
      });
      prisma.testCase.count.mockResolvedValue(42);
      prisma.defect.count.mockResolvedValue(3);
      prisma.kPISnapshot.findFirst.mockResolvedValueOnce({
        metric: 'PASS_RATE_7D',
        value: 88.5,
      });
      prisma.kPISnapshot.findFirst.mockResolvedValueOnce({
        metric: 'COVERAGE_PCT',
        value: 75.0,
      });
      prisma.testResult.groupBy.mockResolvedValue([]);
      prisma.testCase.findMany.mockResolvedValue([]);
      prisma.testRun.findMany.mockResolvedValue([]);

      const buffer = await service.generatePDFReport(projectId);
      const content = buffer.toString('utf-8');

      expect(content).toContain('Report Test Project');
      expect(content).toContain('42');
      expect(content).toContain('88.5');
      expect(content).toContain('75');
    });

    it('should contain key section headers in the report', async () => {
      prisma.project.findUniqueOrThrow.mockResolvedValue({
        id: projectId,
        name: 'Sections Test',
      });
      prisma.testCase.count.mockResolvedValue(10);
      prisma.defect.count.mockResolvedValue(0);
      prisma.kPISnapshot.findFirst.mockResolvedValue(null);
      prisma.testResult.groupBy.mockResolvedValue([]);
      prisma.testCase.findMany.mockResolvedValue([]);
      prisma.testRun.findMany.mockResolvedValue([]);

      const buffer = await service.generatePDFReport(projectId);
      const content = buffer.toString('utf-8');

      expect(content).toContain('Quality Observability Report');
      expect(content).toContain('KPI Summary');
      expect(content).toContain('Total Test Cases');
      expect(content).toContain('Open Defects');
    });
  });
});
