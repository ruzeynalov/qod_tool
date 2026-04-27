import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AggregationService {
  constructor(private readonly prisma: PrismaService) {}

  async computeCoveragePct(projectId: string): Promise<number> {
    const [automatedCount, totalCount] = await Promise.all([
      this.prisma.testCase.count({
        where: { projectId, automationStatus: 'AUTOMATED', deletedAt: null },
      }),
      this.prisma.testCase.count({
        where: { projectId, deletedAt: null },
      }),
    ]);

    if (totalCount === 0) return 0;
    return (automatedCount / totalCount) * 100;
  }

  async computePassRate(projectId: string, days: number): Promise<number> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [passedCount, totalCount] = await Promise.all([
      this.prisma.testResult.count({
        where: {
          testCase: { projectId, deletedAt: null },
          status: 'PASSED',
          createdAt: { gte: since },
        },
      }),
      this.prisma.testResult.count({
        where: {
          testCase: { projectId, deletedAt: null },
          createdAt: { gte: since },
        },
      }),
    ]);

    if (totalCount === 0) return 0;
    return (passedCount / totalCount) * 100;
  }

  async computeFlakyRate(projectId: string): Promise<number> {
    // Step 1: Get last 25 runs, GitHub-first (best signal from Allure results)
    const recentRuns = await this.getRecentRunsForFlaky(projectId);

    if (recentRuns.length === 0) return 0;

    const runIds = recentRuns.map((r) => r.id);
    const runDateMap = new Map(recentRuns.map((r) => [r.id, r.startedAt]));

    // Step 2: Get automated test cases with results from those runs
    const automatedTests = await this.prisma.testCase.findMany({
      where: { projectId, automationStatus: 'AUTOMATED', deletedAt: null },
      select: {
        id: true,
        testResults: {
          where: { runId: { in: runIds } },
          select: {
            status: true,
            runId: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (automatedTests.length === 0) return 0;

    let flakyCount = 0;

    for (const testCase of automatedTests) {
      if (testCase.testResults.length === 0) continue;

      // Deduplicate: keep the latest result per run (last wins)
      const byRun = new Map<string, { status: string; startedAt: Date }>();
      for (const r of testCase.testResults) {
        byRun.set(r.runId, {
          status: r.status,
          startedAt: runDateMap.get(r.runId)!,
        });
      }

      // Sort by run date, newest first
      const statuses = Array.from(byRun.values())
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
        .map((r) => r.status)
        .filter((s) => s === 'PASSED' || s === 'FAILED');

      if (this.isFlaky(statuses)) {
        flakyCount++;
      }
    }

    return (flakyCount / automatedTests.length) * 100;
  }

  /** Get runs from the last 90 days for flaky detection.
   *  Old runs accumulate across syncs and are never pruned, so an unbounded
   *  query would include ancient history that inflates the flaky rate. */
  private async getRecentRunsForFlaky(projectId: string) {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);
    return this.prisma.testRun.findMany({
      where: { projectId, deletedAt: null, startedAt: { gte: ninetyDaysAgo } },
      orderBy: { startedAt: 'desc' },
      select: { id: true, startedAt: true },
    });
  }

  private isFlaky(statuses: string[]): boolean {
    if (statuses.length < 2) return false;

    // A test is flaky if it has 2+ transitions (at least one full flip:
    // PASS→FAIL→PASS or FAIL→PASS→FAIL). A single transition (1) is a
    // regression or fix, not flakiness.
    let transitions = 0;
    for (let i = 1; i < statuses.length; i++) {
      if (statuses[i] !== statuses[i - 1]) transitions++;
    }
    return transitions >= 2;
  }

  async computeMTTD(projectId: string): Promise<number> {
    const runs = await this.prisma.testRun.findMany({
      where: {
        projectId,
        deletedAt: null,
        sha: { not: null },
        testResults: {
          some: { status: 'FAILED' },
        },
      },
      include: {
        testResults: {
          where: { status: 'FAILED' },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });

    if (runs.length === 0) return 0;

    let totalHours = 0;
    for (const run of runs) {
      const firstFailure = run.testResults[0];
      if (firstFailure) {
        const diffMs =
          new Date(firstFailure.createdAt).getTime() -
          new Date(run.startedAt).getTime();
        totalHours += diffMs / (1000 * 60 * 60);
      }
    }

    return totalHours / runs.length;
  }

  async computeMTTR(projectId: string): Promise<number> {
    const since = new Date();
    since.setDate(since.getDate() - 90);

    const defects = await this.prisma.defect.findMany({
      where: {
        projectId,
        deletedAt: null,
        resolvedAt: { not: null },
        // Both created and resolved in the last 90 days for representative MTTR
        createdAt: { gte: since },
      },
      select: {
        createdAt: true,
        resolvedAt: true,
      },
    });

    if (defects.length === 0) return 0;

    const hours = defects
      .map((d) => {
        const diffMs =
          new Date(d.resolvedAt!).getTime() - new Date(d.createdAt).getTime();
        return diffMs / (1000 * 60 * 60);
      })
      .sort((a, b) => a - b);

    // Use median to reduce skew from outliers
    const mid = Math.floor(hours.length / 2);
    return hours.length % 2 === 0
      ? (hours[mid - 1] + hours[mid]) / 2
      : hours[mid];
  }

  async computeEscapeRate(projectId: string): Promise<number> {
    const [escapedCount, totalCount] = await Promise.all([
      this.prisma.defect.count({
        where: { projectId, isEscaped: true, deletedAt: null },
      }),
      this.prisma.defect.count({
        where: { projectId, deletedAt: null },
      }),
    ]);

    if (totalCount === 0) return 0;
    return (escapedCount / totalCount) * 100;
  }

  async computeExecVelocity(projectId: string, days: number): Promise<number> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const runCount = await this.prisma.testRun.count({
      where: {
        projectId,
        deletedAt: null,
        startedAt: { gte: since },
      },
    });

    return runCount / days;
  }

  async computeReqCoverage(projectId: string): Promise<number> {
    const [stories, testCases] = await Promise.all([
      this.prisma.story.findMany({
        where: { projectId },
        select: { externalId: true },
      }),
      this.prisma.testCase.findMany({
        where: { projectId, deletedAt: null, references: { not: null } },
        select: { references: true },
      }),
    ]);

    if (stories.length === 0) return 0;

    // Build set of all story/ticket keys referenced by test cases
    const referencedKeys = new Set<string>();
    for (const tc of testCases) {
      const matches = (tc.references ?? '').match(/[A-Z]+-\d+/g);
      if (matches) for (const m of matches) referencedKeys.add(m);
    }

    const covered = stories.filter((s) => s.externalId && referencedKeys.has(s.externalId)).length;
    return (covered / stories.length) * 100;
  }

  async computeDefectDensity(projectId: string): Promise<number> {
    // Open defects per 100 test cases (matches the overview card: % of test
    // cases covered by an open defect).
    const [openDefects, totalTestCases] = await Promise.all([
      this.prisma.defect.count({
        where: {
          projectId,
          deletedAt: null,
          status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] },
        },
      }),
      this.prisma.testCase.count({
        where: { projectId, deletedAt: null },
      }),
    ]);

    if (totalTestCases === 0) return 0;
    return (openDefects / totalTestCases) * 100;
  }

  async computeReadinessScore(projectId: string): Promise<number> {
    const passRate = await this.computePassRate(projectId, 7);
    const coveragePct = await this.computeCoveragePct(projectId);

    const [openCriticalCount, totalDefectCount] = await Promise.all([
      this.prisma.defect.count({
        where: {
          projectId,
          deletedAt: null,
          status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] },
          severity: 'CRITICAL',
        },
      }),
      this.prisma.defect.count({
        where: { projectId, deletedAt: null },
      }),
    ]);

    const criticalRatio =
      totalDefectCount === 0
        ? 0
        : (openCriticalCount / totalDefectCount) * 100;

    return 0.4 * passRate + 0.3 * coveragePct + 0.3 * (100 - criticalRatio);
  }

  async runAggregation(projectId: string): Promise<void> {
    const [
      coveragePct,
      passRate7d,
      passRate30d,
      flakyRate,
      mttd,
      mttr,
      escapeRate,
      execVelocity,
      reqCoverage,
      readinessScore,
      defectDensity,
    ] = await Promise.all([
      this.computeCoveragePct(projectId),
      this.computePassRate(projectId, 7),
      this.computePassRate(projectId, 30),
      this.computeFlakyRate(projectId),
      this.computeMTTD(projectId),
      this.computeMTTR(projectId),
      this.computeEscapeRate(projectId),
      this.computeExecVelocity(projectId, 7),
      this.computeReqCoverage(projectId),
      this.computeReadinessScore(projectId),
      this.computeDefectDensity(projectId),
    ]);

    const now = new Date();

    await this.prisma.kPISnapshot.createMany({
      data: [
        { projectId, metric: 'COVERAGE_PCT' as any, value: coveragePct, recordedAt: now },
        { projectId, metric: 'PASS_RATE_7D' as any, value: passRate7d, recordedAt: now },
        { projectId, metric: 'PASS_RATE_30D' as any, value: passRate30d, recordedAt: now },
        { projectId, metric: 'FLAKY_RATE' as any, value: flakyRate, recordedAt: now },
        { projectId, metric: 'MTTD_HOURS' as any, value: mttd, recordedAt: now },
        { projectId, metric: 'MTTR_HOURS' as any, value: mttr, recordedAt: now },
        { projectId, metric: 'ESCAPE_RATE' as any, value: escapeRate, recordedAt: now },
        { projectId, metric: 'EXEC_VELOCITY' as any, value: execVelocity, recordedAt: now },
        { projectId, metric: 'REQ_COVERAGE' as any, value: reqCoverage, recordedAt: now },
        { projectId, metric: 'READINESS_SCORE' as any, value: readinessScore, recordedAt: now },
        { projectId, metric: 'DEFECT_DENSITY' as any, value: defectDensity, recordedAt: now },
      ],
    });
  }
}
