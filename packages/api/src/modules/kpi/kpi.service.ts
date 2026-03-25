import { Injectable, Logger } from '@nestjs/common';
import { KPIMetric } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

type RAGStatus = 'green' | 'amber' | 'red';

const LOWER_IS_BETTER_METRICS = new Set([
  'FLAKY_RATE',
  'MTTD_HOURS',
  'MTTR_HOURS',
  'ESCAPE_RATE',
]);

// Metrics where value 0 means "no data available" rather than "the real value is zero"
const ZERO_MEANS_NO_DATA = new Set([
  'MTTD_HOURS',      // 0 means no SHA-linked failing runs found
  'MTTR_HOURS',      // 0 means no resolved defects in window
]);

const DEFAULT_THRESHOLDS: Record<string, { target: number; green: number; amber: number }> = {
  COVERAGE_PCT:    { target: 80, green: 80, amber: 50 },
  PASS_RATE_7D:    { target: 95, green: 90, amber: 75 },
  PASS_RATE_30D:   { target: 95, green: 90, amber: 75 },
  FLAKY_RATE:      { target: 5,  green: 5,  amber: 15 },
  MTTD_HOURS:      { target: 4,  green: 4,  amber: 12 },
  MTTR_HOURS:      { target: 48, green: 48, amber: 168 },
  ESCAPE_RATE:     { target: 5,  green: 5,  amber: 15 },
  EXEC_VELOCITY:   { target: 1,  green: 1,  amber: 0.5 },
  REQ_COVERAGE:    { target: 80, green: 80, amber: 50 },
  READINESS_SCORE: { target: 80, green: 80, amber: 60 },
};

// A5: In-memory cache with TTL
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class KPIService {
  private readonly logger = new Logger(KPIService.name);

  // A5: Cache maps keyed by projectId
  private readonly dashboardCache = new Map<string, CacheEntry<any>>();
  private readonly snapshotsCache = new Map<string, CacheEntry<any>>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * A5: Invalidate all cached data for a project.
   * Call this after sync completes to ensure fresh data on next request.
   */
  invalidateCache(projectId: string): void {
    this.dashboardCache.delete(projectId);
    this.snapshotsCache.delete(projectId);
    this.logger.debug(`Cache invalidated for project ${projectId}`);
  }

  async getLatestSnapshots(projectId: string) {
    // A5: Check cache first
    const cached = this.snapshotsCache.get(projectId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const result = await this.prisma.kPISnapshot.findMany({
      where: { projectId },
      orderBy: { recordedAt: 'desc' },
      distinct: ['metric'],
    });

    // Store in cache
    this.snapshotsCache.set(projectId, {
      data: result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return result;
  }

  async getSnapshotHistory(projectId: string, metric: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return this.prisma.kPISnapshot.findMany({
      where: {
        projectId,
        metric: metric as KPIMetric,
        recordedAt: { gte: since },
      },
      orderBy: { recordedAt: 'asc' },
    });
  }

  async getTargets(projectId: string) {
    return this.prisma.kPITarget.findMany({
      where: { projectId },
    });
  }

  async upsertTarget(
    projectId: string,
    metric: string,
    target: number,
    greenThreshold: number,
    amberThreshold: number,
  ) {
    // Invalidate cache when targets change (affects RAG status)
    this.invalidateCache(projectId);

    return this.prisma.kPITarget.upsert({
      where: {
        projectId_metric: { projectId, metric: metric as KPIMetric },
      },
      create: {
        projectId,
        metric: metric as KPIMetric,
        target,
        greenThreshold,
        amberThreshold,
      },
      update: {
        target,
        greenThreshold,
        amberThreshold,
      },
    });
  }

  getRAGStatus(
    value: number,
    target: { metric: string; greenThreshold: number; amberThreshold: number },
  ): RAGStatus {
    const lowerIsBetter = LOWER_IS_BETTER_METRICS.has(target.metric);

    if (lowerIsBetter) {
      if (value <= target.greenThreshold) return 'green';
      if (value <= target.amberThreshold) return 'amber';
      return 'red';
    } else {
      if (value >= target.greenThreshold) return 'green';
      if (value >= target.amberThreshold) return 'amber';
      return 'red';
    }
  }

  async getKPIDashboard(projectId: string) {
    // A5: Check cache first
    const cached = this.dashboardCache.get(projectId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const [latestSnapshots, targets] = await Promise.all([
      this.getLatestSnapshots(projectId),
      this.getTargets(projectId),
    ]);

    if (latestSnapshots.length === 0) return [];

    const targetMap = new Map(targets.map((t: any) => [t.metric, t]));

    const dashboard = await Promise.all(
      latestSnapshots.map(async (snapshot: any) => {
        const sparkline = await this.getSnapshotHistory(
          projectId,
          snapshot.metric,
          30,
        );

        const trend = this.computeTrend(sparkline);

        const target = targetMap.get(snapshot.metric) as any;
        const defaults = DEFAULT_THRESHOLDS[snapshot.metric];
        const effectiveTarget = target ?? (defaults ? {
          metric: snapshot.metric,
          greenThreshold: defaults.green,
          amberThreshold: defaults.amber,
        } : null);
        const hasData = !(ZERO_MEANS_NO_DATA.has(snapshot.metric) && snapshot.value === 0);

        const ragStatus = effectiveTarget && hasData
          ? this.getRAGStatus(snapshot.value, effectiveTarget)
          : 'green';

        return {
          metric: snapshot.metric,
          latestValue: snapshot.value,
          hasData,
          target: target?.target ?? defaults?.target ?? null,
          ragStatus: hasData ? ragStatus.toUpperCase() : 'NONE',
          sparkline: sparkline.map((s: any) => ({
            date: s.recordedAt,
            value: s.value,
          })),
          trend: trend === 'up' ? 'UP' : trend === 'down' ? 'DOWN' : 'FLAT',
        };
      }),
    );

    // Store in cache
    this.dashboardCache.set(projectId, {
      data: dashboard,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return dashboard;
  }

  private computeTrend(
    sparkline: Array<{ value: number; recordedAt: Date }>,
  ): 'up' | 'down' | 'stable' {
    if (sparkline.length < 2) return 'stable';

    const sorted = [...sparkline].sort(
      (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
    );
    const latest = new Date(sorted[sorted.length - 1].recordedAt);
    const sevenDaysAgo = new Date(latest.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(latest.getTime() - 14 * 24 * 60 * 60 * 1000);

    const recentValues = sparkline
      .filter((s) => new Date(s.recordedAt) >= sevenDaysAgo)
      .map((s) => s.value);

    const previousValues = sparkline
      .filter(
        (s) =>
          new Date(s.recordedAt) >= fourteenDaysAgo &&
          new Date(s.recordedAt) < sevenDaysAgo,
      )
      .map((s) => s.value);

    if (recentValues.length === 0 || previousValues.length === 0) {
      return 'stable';
    }

    const recentAvg =
      recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
    const previousAvg =
      previousValues.reduce((a, b) => a + b, 0) / previousValues.length;

    const diff = recentAvg - previousAvg;
    const threshold = Math.max(Math.abs(previousAvg) * 0.01, 0.5);

    if (diff > threshold) return 'up';
    if (diff < -threshold) return 'down';
    return 'stable';
  }
}
