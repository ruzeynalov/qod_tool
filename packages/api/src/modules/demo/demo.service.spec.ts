import { createPrismaMock, PrismaMock } from '../../common/utils/prisma-mock';
import { DemoService } from './demo.service';
import { PrismaService } from '../../database/prisma.service';
import { DEFAULT_DEMO_CONFIG } from '@qod/shared';

describe('DemoService', () => {
  let service: DemoService;
  let prisma: PrismaMock;

  const projectId = 'proj-uuid-demo';

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new DemoService(prisma as unknown as PrismaService);
  });

  // ── isDemoMode ──────────────────────────────────────────────

  describe('isDemoMode()', () => {
    it('should return true when project.demoMode is true', async () => {
      prisma.project.findUnique.mockResolvedValue({
        id: projectId,
        demoMode: true,
        connectorConfigs: [{ id: 'cc-1' }],
      });

      const result = await service.isDemoMode(projectId);

      expect(result).toBe(true);
    });

    it('should return true when project has zero connectors', async () => {
      prisma.project.findUnique.mockResolvedValue({
        id: projectId,
        demoMode: false,
        connectorConfigs: [],
      });

      const result = await service.isDemoMode(projectId);

      expect(result).toBe(true);
    });

    it('should return false when project has connectors and demoMode is false', async () => {
      prisma.project.findUnique.mockResolvedValue({
        id: projectId,
        demoMode: false,
        connectorConfigs: [{ id: 'cc-1' }],
      });

      const result = await service.isDemoMode(projectId);

      expect(result).toBe(false);
    });

    it('should return false when project is not found', async () => {
      prisma.project.findUnique.mockResolvedValue(null);

      const result = await service.isDemoMode(projectId);

      expect(result).toBe(false);
    });

    it('should query prisma with the correct params', async () => {
      prisma.project.findUnique.mockResolvedValue({
        id: projectId,
        demoMode: false,
        connectorConfigs: [],
      });

      await service.isDemoMode(projectId);

      expect(prisma.project.findUnique).toHaveBeenCalledWith({
        where: { id: projectId },
        include: { connectorConfigs: true },
      });
    });
  });

  // ── getDemoOverview ─────────────────────────────────────────

  describe('getDemoOverview()', () => {
    it('should return overview with KPI summaries, recent runs count, and defect counts', async () => {
      const overview = await service.getDemoOverview(projectId);

      expect(overview).toHaveProperty('totalTestCases');
      expect(overview).toHaveProperty('totalTestRuns');
      expect(overview).toHaveProperty('totalDefects');
      expect(overview).toHaveProperty('openDefects');
      expect(overview).toHaveProperty('recentRunsCount');
      expect(overview).toHaveProperty('kpiSummary');

      expect(overview.totalTestCases).toBe(DEFAULT_DEMO_CONFIG.testCaseCount);
      expect(overview.totalDefects).toBe(DEFAULT_DEMO_CONFIG.defectCount);
      expect(overview.totalTestRuns).toBeGreaterThan(0);
      expect(overview.openDefects).toBeGreaterThanOrEqual(0);
      expect(overview.openDefects).toBeLessThanOrEqual(overview.totalDefects);
      expect(overview.recentRunsCount).toBeLessThanOrEqual(10);
    });

    it('should include KPI summary entries with value and target', async () => {
      const overview = await service.getDemoOverview(projectId);

      expect(overview.kpiSummary).toHaveProperty('COVERAGE_PCT');
      expect(overview.kpiSummary['COVERAGE_PCT']).toHaveProperty('value');
      expect(overview.kpiSummary['COVERAGE_PCT']).toHaveProperty('target');
    });
  });

  // ── getDemoTestCases ────────────────────────────────────────

  describe('getDemoTestCases()', () => {
    it('should return paginated test cases with defaults', async () => {
      const result = await service.getDemoTestCases(projectId);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page', 1);
      expect(result).toHaveProperty('limit', 20);
      expect(result.data.length).toBeLessThanOrEqual(20);
      expect(result.total).toBe(DEFAULT_DEMO_CONFIG.testCaseCount);
    });

    it('should support pagination', async () => {
      const page1 = await service.getDemoTestCases(projectId, { page: 1, limit: 5 });
      const page2 = await service.getDemoTestCases(projectId, { page: 2, limit: 5 });

      expect(page1.data.length).toBe(5);
      expect(page2.data.length).toBe(5);
      expect(page1.data[0].id).not.toBe(page2.data[0].id);
    });

    it('should filter by featureAreaId', async () => {
      // Get feature areas to pick a valid one
      const areas = await service.getFeatureAreas(projectId);
      const targetArea = areas[0];

      const result = await service.getDemoTestCases(projectId, {
        featureAreaId: targetArea.id,
        limit: 1000,
      });

      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data.every((tc) => tc.featureAreaId === targetArea.id)).toBe(true);
      expect(result.total).toBeLessThan(DEFAULT_DEMO_CONFIG.testCaseCount);
    });

    it('should filter by type', async () => {
      const result = await service.getDemoTestCases(projectId, {
        type: 'MANUAL',
        limit: 1000,
      });

      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data.every((tc) => tc.type === 'MANUAL')).toBe(true);
    });
  });

  // ── getDemoTestRuns ─────────────────────────────────────────

  describe('getDemoTestRuns()', () => {
    it('should return paginated test runs with defaults', async () => {
      const result = await service.getDemoTestRuns(projectId);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page', 1);
      expect(result).toHaveProperty('limit', 20);
      expect(result.data.length).toBeLessThanOrEqual(20);
      expect(result.total).toBeGreaterThan(0);
    });

    it('should support pagination', async () => {
      const page1 = await service.getDemoTestRuns(projectId, { page: 1, limit: 5 });
      const page2 = await service.getDemoTestRuns(projectId, { page: 2, limit: 5 });

      expect(page1.data.length).toBe(5);
      expect(page2.data.length).toBe(5);
      expect(page1.data[0].id).not.toBe(page2.data[0].id);
    });

    it('should filter by status', async () => {
      const result = await service.getDemoTestRuns(projectId, {
        status: 'FAILED',
        limit: 1000,
      });

      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data.every((tr) => tr.status === 'FAILED')).toBe(true);
    });

    it('should filter by branch', async () => {
      const result = await service.getDemoTestRuns(projectId, {
        branch: 'main',
        limit: 1000,
      });

      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data.every((tr) => tr.branch === 'main')).toBe(true);
    });
  });

  // ── getDemoDefects ──────────────────────────────────────────

  describe('getDemoDefects()', () => {
    it('should return paginated defects with defaults', async () => {
      const result = await service.getDemoDefects(projectId);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page', 1);
      expect(result).toHaveProperty('limit', 20);
      expect(result.data.length).toBeLessThanOrEqual(20);
      expect(result.total).toBe(DEFAULT_DEMO_CONFIG.defectCount);
    });

    it('should support pagination', async () => {
      const page1 = await service.getDemoDefects(projectId, { page: 1, limit: 5 });
      const page2 = await service.getDemoDefects(projectId, { page: 2, limit: 5 });

      expect(page1.data.length).toBe(5);
      expect(page2.data.length).toBe(5);
      expect(page1.data[0].id).not.toBe(page2.data[0].id);
    });

    it('should filter by severity', async () => {
      const result = await service.getDemoDefects(projectId, {
        severity: 'CRITICAL',
        limit: 1000,
      });

      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data.every((d) => d.severity === 'CRITICAL')).toBe(true);
    });

    it('should filter by status', async () => {
      const result = await service.getDemoDefects(projectId, {
        status: 'OPEN',
        limit: 1000,
      });

      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data.every((d) => d.status === 'OPEN')).toBe(true);
    });
  });

  // ── getDemoKPISnapshots ─────────────────────────────────────

  describe('getDemoKPISnapshots()', () => {
    it('should return KPI time-series data', async () => {
      const result = await service.getDemoKPISnapshots(projectId);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('metric');
      expect(result[0]).toHaveProperty('value');
      expect(result[0]).toHaveProperty('target');
      expect(result[0]).toHaveProperty('recordedAt');
    });

    it('should filter by metric', async () => {
      const result = await service.getDemoKPISnapshots(projectId, 'COVERAGE_PCT');

      expect(result.length).toBeGreaterThan(0);
      expect(result.every((s) => s.metric === 'COVERAGE_PCT')).toBe(true);
    });

    it('should filter by days', async () => {
      const allSnapshots = await service.getDemoKPISnapshots(projectId);
      const recentSnapshots = await service.getDemoKPISnapshots(projectId, undefined, 7);

      expect(recentSnapshots.length).toBeGreaterThan(0);
      expect(recentSnapshots.length).toBeLessThan(allSnapshots.length);
    });
  });

  // ── getDemoPipelineRuns ─────────────────────────────────────

  describe('getDemoPipelineRuns()', () => {
    it('should return pipeline runs', async () => {
      const result = await service.getDemoPipelineRuns(projectId);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('workflowName');
      expect(result[0]).toHaveProperty('branch');
      expect(result[0]).toHaveProperty('sha');
      expect(result[0]).toHaveProperty('status');
      expect(result[0]).toHaveProperty('durationMs');
      expect(result[0]).toHaveProperty('triggeredBy');
      expect(result[0]).toHaveProperty('startedAt');
    });
  });

  // ── Deterministic data ──────────────────────────────────────

  describe('deterministic generation', () => {
    it('should return the same data for the same projectId across calls', async () => {
      const run1 = await service.getDemoOverview(projectId);
      const run2 = await service.getDemoOverview(projectId);

      expect(run1).toEqual(run2);
    });

    it('should return different data for different projectIds', async () => {
      const run1 = await service.getDemoOverview('project-aaa');
      const run2 = await service.getDemoOverview('project-bbb');

      // Overview structure is similar but KPI values should differ due to different seeds
      expect(run1.kpiSummary).not.toEqual(run2.kpiSummary);
    });
  });

  // ── getFeatureAreas ─────────────────────────────────────────

  describe('getFeatureAreas()', () => {
    it('should return demo feature areas', async () => {
      const result = await service.getFeatureAreas(projectId);

      expect(result.length).toBe(DEFAULT_DEMO_CONFIG.featureAreas.length);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('color');
      expect(result.map((fa) => fa.name)).toEqual(
        expect.arrayContaining(DEFAULT_DEMO_CONFIG.featureAreas),
      );
    });
  });
});
