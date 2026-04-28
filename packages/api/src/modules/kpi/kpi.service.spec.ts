import { vi } from 'vitest';
import { createPrismaMock, PrismaMock } from '../../common/utils/prisma-mock';
import { KPIService } from './kpi.service';
import { KPIFormulaService } from './kpi-formula.service';
import { PrismaService } from '../../database/prisma.service';

describe('KPIService', () => {
  let service: KPIService;
  let prisma: PrismaMock;

  const projectId = 'proj-uuid-1';

  const formulaServiceStub = {
    getFormulaChangePoints: vi.fn().mockResolvedValue({}),
  } as unknown as KPIFormulaService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new KPIService(prisma as unknown as PrismaService, formulaServiceStub);
  });

  describe('getLatestSnapshots()', () => {
    it('should return the latest snapshot for each metric', async () => {
      const snapshots = [
        {
          id: 'snap-1',
          projectId,
          metric: 'COVERAGE_PCT',
          value: 85.5,
          target: 90,
          recordedAt: new Date('2026-03-05'),
        },
        {
          id: 'snap-2',
          projectId,
          metric: 'PASS_RATE_7D',
          value: 97.2,
          target: 95,
          recordedAt: new Date('2026-03-05'),
        },
      ];

      prisma.kPISnapshot.findMany.mockResolvedValue(snapshots);

      const result = await service.getLatestSnapshots(projectId);

      expect(prisma.kPISnapshot.findMany).toHaveBeenCalledWith({
        where: { projectId },
        orderBy: { recordedAt: 'desc' },
        distinct: ['metric'],
      });
      expect(result).toEqual(snapshots);
    });

    it('should return an empty array when no snapshots exist', async () => {
      prisma.kPISnapshot.findMany.mockResolvedValue([]);

      const result = await service.getLatestSnapshots(projectId);

      expect(result).toEqual([]);
    });
  });

  describe('getSnapshotHistory()', () => {
    it('should return time-series data for a given metric and days', async () => {
      const snapshots = [
        {
          id: 'snap-1',
          projectId,
          metric: 'PASS_RATE_7D',
          value: 96.0,
          recordedAt: new Date('2026-03-03'),
        },
        {
          id: 'snap-2',
          projectId,
          metric: 'PASS_RATE_7D',
          value: 97.2,
          recordedAt: new Date('2026-03-04'),
        },
      ];

      prisma.kPISnapshot.findMany.mockResolvedValue(snapshots);

      const result = await service.getSnapshotHistory(projectId, 'PASS_RATE_7D', 30);

      expect(prisma.kPISnapshot.findMany).toHaveBeenCalledWith({
        where: {
          projectId,
          metric: 'PASS_RATE_7D',
          recordedAt: { gte: expect.any(Date) },
        },
        orderBy: { recordedAt: 'asc' },
      });
      expect(result).toEqual(snapshots);
    });

    it('should default to 30 days when days is not specified', async () => {
      prisma.kPISnapshot.findMany.mockResolvedValue([]);

      await service.getSnapshotHistory(projectId, 'COVERAGE_PCT');

      const call = prisma.kPISnapshot.findMany.mock.calls[0][0];
      const since = call.where.recordedAt.gte as Date;
      const now = new Date();
      const diffDays = Math.round((now.getTime() - since.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeGreaterThanOrEqual(29);
      expect(diffDays).toBeLessThanOrEqual(31);
    });
  });

  describe('getTargets()', () => {
    it('should return all KPI targets for a project', async () => {
      const targets = [
        {
          id: 'tgt-1',
          projectId,
          metric: 'COVERAGE_PCT',
          target: 90,
          greenThreshold: 85,
          amberThreshold: 70,
        },
        {
          id: 'tgt-2',
          projectId,
          metric: 'PASS_RATE_7D',
          target: 95,
          greenThreshold: 90,
          amberThreshold: 80,
        },
      ];

      prisma.kPITarget.findMany.mockResolvedValue(targets);

      const result = await service.getTargets(projectId);

      expect(prisma.kPITarget.findMany).toHaveBeenCalledWith({
        where: { projectId },
      });
      expect(result).toEqual(targets);
    });
  });

  describe('upsertTarget()', () => {
    it('should create a new target when none exists', async () => {
      const created = {
        id: 'tgt-1',
        projectId,
        metric: 'COVERAGE_PCT',
        target: 90,
        greenThreshold: 85,
        amberThreshold: 70,
      };

      prisma.kPITarget.upsert.mockResolvedValue(created);

      const result = await service.upsertTarget(projectId, 'COVERAGE_PCT', 90, 85, 70);

      expect(prisma.kPITarget.upsert).toHaveBeenCalledWith({
        where: {
          projectId_metric: { projectId, metric: 'COVERAGE_PCT' },
        },
        create: {
          projectId,
          metric: 'COVERAGE_PCT',
          target: 90,
          greenThreshold: 85,
          amberThreshold: 70,
        },
        update: {
          target: 90,
          greenThreshold: 85,
          amberThreshold: 70,
        },
      });
      expect(result).toEqual(created);
    });

    it('should update an existing target', async () => {
      const updated = {
        id: 'tgt-1',
        projectId,
        metric: 'PASS_RATE_7D',
        target: 98,
        greenThreshold: 95,
        amberThreshold: 85,
      };

      prisma.kPITarget.upsert.mockResolvedValue(updated);

      const result = await service.upsertTarget(projectId, 'PASS_RATE_7D', 98, 95, 85);

      expect(result).toEqual(updated);
    });
  });

  describe('getRAGStatus()', () => {
    // "Higher is better" metrics: COVERAGE_PCT, PASS_RATE_7D, PASS_RATE_30D,
    //   EXEC_VELOCITY, REQ_COVERAGE, READINESS_SCORE
    // value >= greenThreshold => green
    // value >= amberThreshold => amber
    // else => red

    it('should return green when value meets green threshold (higher is better)', () => {
      const target = {
        metric: 'COVERAGE_PCT',
        target: 90,
        greenThreshold: 85,
        amberThreshold: 70,
      };

      expect(service.getRAGStatus(90, target as any)).toBe('green');
      expect(service.getRAGStatus(85, target as any)).toBe('green');
    });

    it('should return amber when value is between amber and green thresholds (higher is better)', () => {
      const target = {
        metric: 'COVERAGE_PCT',
        target: 90,
        greenThreshold: 85,
        amberThreshold: 70,
      };

      expect(service.getRAGStatus(80, target as any)).toBe('amber');
      expect(service.getRAGStatus(70, target as any)).toBe('amber');
    });

    it('should return red when value is below amber threshold (higher is better)', () => {
      const target = {
        metric: 'COVERAGE_PCT',
        target: 90,
        greenThreshold: 85,
        amberThreshold: 70,
      };

      expect(service.getRAGStatus(60, target as any)).toBe('red');
    });

    // "Lower is better" metrics: FLAKY_RATE, MTTD_HOURS, MTTR_HOURS, ESCAPE_RATE
    // value <= greenThreshold => green
    // value <= amberThreshold => amber
    // else => red

    it('should return green when value is at or below green threshold (lower is better)', () => {
      const target = {
        metric: 'FLAKY_RATE',
        target: 5,
        greenThreshold: 5,
        amberThreshold: 15,
      };

      expect(service.getRAGStatus(3, target as any)).toBe('green');
      expect(service.getRAGStatus(5, target as any)).toBe('green');
    });

    it('should return amber when value is between green and amber thresholds (lower is better)', () => {
      const target = {
        metric: 'MTTD_HOURS',
        target: 2,
        greenThreshold: 4,
        amberThreshold: 12,
      };

      expect(service.getRAGStatus(6, target as any)).toBe('amber');
      expect(service.getRAGStatus(12, target as any)).toBe('amber');
    });

    it('should return red when value exceeds amber threshold (lower is better)', () => {
      const target = {
        metric: 'MTTR_HOURS',
        target: 24,
        greenThreshold: 24,
        amberThreshold: 72,
      };

      expect(service.getRAGStatus(100, target as any)).toBe('red');
    });

    it('should return green for ESCAPE_RATE at zero', () => {
      const target = {
        metric: 'ESCAPE_RATE',
        target: 5,
        greenThreshold: 5,
        amberThreshold: 15,
      };

      expect(service.getRAGStatus(0, target as any)).toBe('green');
    });
  });

  describe('getKPIDashboard()', () => {
    it('should return all KPIs with latest value, target, RAG status, sparkline, and trend', async () => {
      const now = new Date('2026-03-05T12:00:00Z');

      // Latest snapshots (one per metric)
      const latestSnapshots = [
        {
          id: 'snap-1',
          projectId,
          metric: 'COVERAGE_PCT',
          value: 88,
          target: 90,
          recordedAt: now,
        },
      ];

      // KPI targets
      const targets = [
        {
          id: 'tgt-1',
          projectId,
          metric: 'COVERAGE_PCT',
          target: 90,
          greenThreshold: 85,
          amberThreshold: 70,
        },
      ];

      // Sparkline data (30 days of history)
      const sparklineData = Array.from({ length: 30 }, (_, i) => ({
        id: `spark-${i}`,
        projectId,
        metric: 'COVERAGE_PCT',
        value: 80 + i * 0.3,
        recordedAt: new Date(now.getTime() - (29 - i) * 24 * 60 * 60 * 1000),
      }));

      // Mock: first call is getLatestSnapshots, second+ are getSnapshotHistory
      prisma.kPISnapshot.findMany
        .mockResolvedValueOnce(latestSnapshots)
        .mockResolvedValue(sparklineData);

      prisma.kPITarget.findMany.mockResolvedValue(targets);

      const result = await service.getKPIDashboard(projectId);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);

      const coverageKPI = result.find((k: any) => k.metric === 'COVERAGE_PCT');
      expect(coverageKPI).toBeDefined();
      expect(coverageKPI.latestValue).toBe(88);
      expect(coverageKPI.target).toBe(90);
      expect(coverageKPI.ragStatus).toBe('GREEN');
      expect(coverageKPI.sparkline).toBeDefined();
      expect(coverageKPI.trend).toBeDefined();
      expect(['UP', 'DOWN', 'FLAT']).toContain(coverageKPI.trend);
    });

    it('should handle metrics with no target gracefully', async () => {
      const latestSnapshots = [
        {
          id: 'snap-1',
          projectId,
          metric: 'EXEC_VELOCITY',
          value: 42,
          target: null,
          recordedAt: new Date(),
        },
      ];

      prisma.kPISnapshot.findMany
        .mockResolvedValueOnce(latestSnapshots)
        .mockResolvedValue([]);

      prisma.kPITarget.findMany.mockResolvedValue([]);

      const result = await service.getKPIDashboard(projectId);

      const velocityKPI = result.find((k: any) => k.metric === 'EXEC_VELOCITY');
      expect(velocityKPI).toBeDefined();
      // Default thresholds apply when no explicit target — ragStatus is computed
      expect(velocityKPI.ragStatus).toBeDefined();
    });

    it('should handle empty snapshots', async () => {
      prisma.kPISnapshot.findMany.mockResolvedValue([]);
      prisma.kPITarget.findMany.mockResolvedValue([]);

      const result = await service.getKPIDashboard(projectId);

      expect(result).toEqual([]);
    });

    it('should compute trend direction correctly', async () => {
      const now = new Date();

      const latestSnapshots = [
        {
          id: 'snap-1',
          projectId,
          metric: 'PASS_RATE_7D',
          value: 95,
          target: 90,
          recordedAt: now,
        },
      ];

      // Create sparkline with clear upward trend
      // Recent 7 days: values = 95
      // Previous 7 days (days 8-14): values = 80
      // Older days (15-29): values = 80
      const sparklineData = Array.from({ length: 30 }, (_, i) => ({
        id: `spark-${i}`,
        projectId,
        metric: 'PASS_RATE_7D',
        value: i >= 23 ? 95 : 80, // last 7 entries (indices 23-29) are recent
        recordedAt: new Date(now.getTime() - (29 - i) * 24 * 60 * 60 * 1000),
      }));

      const targets = [
        {
          id: 'tgt-1',
          projectId,
          metric: 'PASS_RATE_7D',
          target: 90,
          greenThreshold: 85,
          amberThreshold: 70,
        },
      ];

      prisma.kPISnapshot.findMany
        .mockResolvedValueOnce(latestSnapshots)
        .mockResolvedValue(sparklineData);

      prisma.kPITarget.findMany.mockResolvedValue(targets);

      const result = await service.getKPIDashboard(projectId);

      const passRateKPI = result.find((k: any) => k.metric === 'PASS_RATE_7D');
      expect(passRateKPI.trend).toBe('UP');
    });
  });
});
