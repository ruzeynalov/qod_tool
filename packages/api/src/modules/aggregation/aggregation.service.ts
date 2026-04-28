import { Injectable } from '@nestjs/common';
import { Parser } from 'expr-eval';
import {
  KPI_FORMULA_DEFINITIONS,
  type FormulaPreviewResult,
  type KPIMetricKey,
  type ResolvedFormulaConfig,
} from '@qod/shared';
import { PrismaService } from '../../database/prisma.service';
import { KPIFormulaService } from '../kpi/kpi-formula.service';

@Injectable()
export class AggregationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly formulaService: KPIFormulaService,
  ) {}

  // ─── Per-metric scalar resolvers ────────────────────────────────────
  // Each method computes the metric's named scalar variables from project
  // data using kept parameters as SQL filters. Expression evaluation is
  // delegated to evaluateMetric().

  async computeCoveragePct(
    projectId: string,
    cfg: ResolvedFormulaConfig,
  ): Promise<{ value: number; breakdown: Record<string, number> }> {
    const groups = await this.prisma.testCase.groupBy({
      by: ['automationStatus'],
      where: { projectId, deletedAt: null },
      _count: { _all: true },
    });

    const variables: Record<string, number> = {
      automatedCount: 0,
      notAutomatedCount: 0,
      needsUpdateCount: 0,
      totalTestCases: 0,
    };
    for (const g of groups) {
      const n = (g as any)._count?._all ?? 0;
      variables.totalTestCases += n;
      if (g.automationStatus === 'AUTOMATED') variables.automatedCount = n;
      else if (g.automationStatus === 'NOT_AUTOMATED') variables.notAutomatedCount = n;
      else if (g.automationStatus === 'NEEDS_UPDATE') variables.needsUpdateCount = n;
    }
    return this.evaluateMetric(cfg, variables);
  }

  async computePassRate(
    projectId: string,
    cfg: ResolvedFormulaConfig,
  ): Promise<{ value: number; breakdown: Record<string, number> }> {
    const days = asInteger(cfg.parameters.windowDays, 7);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const groups = await this.prisma.testResult.groupBy({
      by: ['status'],
      where: {
        testCase: { projectId, deletedAt: null },
        createdAt: { gte: since },
      },
      _count: { _all: true },
    });

    const variables: Record<string, number> = {
      passedResults: 0,
      failedResults: 0,
      skippedResults: 0,
      errorResults: 0,
      flakyResults: 0,
      totalResults: 0,
      windowDays: days,
    };
    for (const g of groups) {
      const n = (g as any)._count?._all ?? 0;
      variables.totalResults += n;
      switch (g.status) {
        case 'PASSED': variables.passedResults = n; break;
        case 'FAILED': variables.failedResults = n; break;
        case 'SKIPPED': variables.skippedResults = n; break;
        case 'ERROR': variables.errorResults = n; break;
        case 'FLAKY': variables.flakyResults = n; break;
      }
    }
    return this.evaluateMetric(cfg, variables);
  }

  async computeFlakyRate(
    projectId: string,
    cfg: ResolvedFormulaConfig,
  ): Promise<{ value: number; breakdown: Record<string, number> }> {
    const windowDays = asInteger(cfg.parameters.windowDays, 90);
    const minTransitions = asInteger(cfg.parameters.minTransitions, 2);
    const automatedStatuses = asStringArray(cfg.parameters.automatedStatuses, ['AUTOMATED']);

    const since = new Date(Date.now() - windowDays * 86_400_000);
    const recentRuns = await this.prisma.testRun.findMany({
      where: { projectId, deletedAt: null, startedAt: { gte: since } },
      orderBy: { startedAt: 'desc' },
      select: { id: true, startedAt: true },
    });

    const variables: Record<string, number> = {
      flakyTestCount: 0,
      automatedTestCount: 0,
      runCount: recentRuns.length,
    };

    if (recentRuns.length === 0) return this.evaluateMetric(cfg, variables);

    const runIds = recentRuns.map((r) => r.id);
    const runDateMap = new Map(recentRuns.map((r) => [r.id, r.startedAt]));

    const automatedTests = await this.prisma.testCase.findMany({
      where: {
        projectId,
        automationStatus: { in: automatedStatuses as any },
        deletedAt: null,
      },
      select: {
        id: true,
        testResults: {
          where: { runId: { in: runIds } },
          select: { status: true, runId: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    variables.automatedTestCount = automatedTests.length;
    if (automatedTests.length === 0) return this.evaluateMetric(cfg, variables);

    let flaky = 0;
    for (const tc of automatedTests) {
      if (tc.testResults.length === 0) continue;
      const byRun = new Map<string, { status: string; startedAt: Date }>();
      for (const r of tc.testResults) {
        byRun.set(r.runId, { status: r.status, startedAt: runDateMap.get(r.runId)! });
      }
      const statuses = Array.from(byRun.values())
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
        .map((r) => r.status)
        .filter((s) => s === 'PASSED' || s === 'FAILED');
      if (countTransitions(statuses) >= minTransitions) flaky++;
    }
    variables.flakyTestCount = flaky;
    return this.evaluateMetric(cfg, variables);
  }

  async computeMTTD(
    projectId: string,
    cfg: ResolvedFormulaConfig,
  ): Promise<{ value: number; breakdown: Record<string, number> }> {
    const requireSha = asBoolean(cfg.parameters.requireSha, true);
    const failedStatuses = asStringArray(cfg.parameters.failedStatuses, ['FAILED']);

    const runs = await this.prisma.testRun.findMany({
      where: {
        projectId,
        deletedAt: null,
        ...(requireSha ? { sha: { not: null } } : {}),
        testResults: { some: { status: { in: failedStatuses as any } } },
      },
      include: {
        testResults: {
          where: { status: { in: failedStatuses as any } },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });

    const hours: number[] = [];
    for (const run of runs) {
      const firstFailure = run.testResults[0];
      if (!firstFailure) continue;
      const diffMs =
        new Date(firstFailure.createdAt).getTime() - new Date(run.startedAt).getTime();
      hours.push(diffMs / 3_600_000);
    }

    const variables: Record<string, number> = {
      meanFailureLatencyHours: hours.length === 0 ? 0 : meanOf(hours),
      medianFailureLatencyHours: hours.length === 0 ? 0 : medianOf(hours),
      failedRunCount: hours.length,
    };
    return this.evaluateMetric(cfg, variables);
  }

  async computeMTTR(
    projectId: string,
    cfg: ResolvedFormulaConfig,
  ): Promise<{ value: number; breakdown: Record<string, number> }> {
    const windowDays = asInteger(cfg.parameters.windowDays, 90);
    const since = new Date();
    since.setDate(since.getDate() - windowDays);

    const defects = await this.prisma.defect.findMany({
      where: {
        projectId,
        deletedAt: null,
        resolvedAt: { not: null },
        createdAt: { gte: since },
      },
      select: { createdAt: true, resolvedAt: true },
    });

    const hours = defects.map(
      (d) => (new Date(d.resolvedAt!).getTime() - new Date(d.createdAt).getTime()) / 3_600_000,
    );

    const variables: Record<string, number> = {
      meanResolutionHours: hours.length === 0 ? 0 : meanOf(hours),
      medianResolutionHours: hours.length === 0 ? 0 : medianOf(hours),
      p90ResolutionHours: hours.length === 0 ? 0 : percentileOf(hours, 90),
      resolvedDefectCount: hours.length,
    };
    return this.evaluateMetric(cfg, variables);
  }

  async computeEscapeRate(
    projectId: string,
    cfg: ResolvedFormulaConfig,
  ): Promise<{ value: number; breakdown: Record<string, number> }> {
    const [escapedDefectCount, totalDefectCount] = await Promise.all([
      this.prisma.defect.count({ where: { projectId, isEscaped: true, deletedAt: null } }),
      this.prisma.defect.count({ where: { projectId, deletedAt: null } }),
    ]);
    return this.evaluateMetric(cfg, { escapedDefectCount, totalDefectCount });
  }

  async computeExecVelocity(
    projectId: string,
    cfg: ResolvedFormulaConfig,
  ): Promise<{ value: number; breakdown: Record<string, number> }> {
    const windowDays = asInteger(cfg.parameters.windowDays, 7);
    const since = new Date();
    since.setDate(since.getDate() - windowDays);

    const runCount = await this.prisma.testRun.count({
      where: { projectId, deletedAt: null, startedAt: { gte: since } },
    });
    return this.evaluateMetric(cfg, { runCount, windowDays });
  }

  async computeReqCoverage(
    projectId: string,
    cfg: ResolvedFormulaConfig,
  ): Promise<{ value: number; breakdown: Record<string, number> }> {
    const pattern = asString(cfg.parameters.referencePattern, '[A-Z]+-\\d+');
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, 'g');
    } catch {
      regex = /[A-Z]+-\d+/g;
    }

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

    const referenced = new Set<string>();
    for (const tc of testCases) {
      const matches = (tc.references ?? '').match(regex);
      if (matches) for (const m of matches) referenced.add(m);
    }

    const totalStoryCount = stories.length;
    const coveredStoryCount = stories.filter(
      (s) => s.externalId && referenced.has(s.externalId),
    ).length;

    return this.evaluateMetric(cfg, {
      coveredStoryCount,
      uncoveredStoryCount: totalStoryCount - coveredStoryCount,
      totalStoryCount,
    });
  }

  async computeDefectDensity(
    projectId: string,
    cfg: ResolvedFormulaConfig,
  ): Promise<{ value: number; breakdown: Record<string, number> }> {
    const openStatuses = asStringArray(cfg.parameters.openStatuses, [
      'OPEN',
      'IN_PROGRESS',
      'REOPENED',
    ]);

    const [openDefectCount, totalTestCases] = await Promise.all([
      this.prisma.defect.count({
        where: { projectId, deletedAt: null, status: { in: openStatuses as any } },
      }),
      this.prisma.testCase.count({ where: { projectId, deletedAt: null } }),
    ]);

    return this.evaluateMetric(cfg, { openDefectCount, totalTestCases });
  }

  /**
   * Composite metric. Computes the input variables from sibling metrics, then
   * evaluates the (possibly user-edited) expression against them.
   */
  async computeReadinessScore(
    projectId: string,
    cfg: ResolvedFormulaConfig,
    allConfigs: Record<KPIMetricKey, ResolvedFormulaConfig>,
  ): Promise<{ value: number; breakdown: Record<string, number> }> {
    const passRateWindowDays = asInteger(cfg.parameters.passRateWindowDays, 7);
    const criticalSeverities = asStringArray(cfg.parameters.criticalSeverities, ['CRITICAL']);
    const openStatuses = asStringArray(cfg.parameters.openStatuses, [
      'OPEN',
      'IN_PROGRESS',
      'REOPENED',
    ]);

    const passRateCfg: ResolvedFormulaConfig = {
      ...allConfigs.PASS_RATE_7D,
      parameters: {
        ...allConfigs.PASS_RATE_7D.parameters,
        windowDays: passRateWindowDays,
      },
    };

    const [
      pass7d,
      pass30d,
      coverage,
      flaky,
      mttd,
      mttr,
      escape,
      exec,
      req,
      density,
    ] = await Promise.all([
      this.computePassRate(projectId, passRateCfg),
      this.computePassRate(projectId, allConfigs.PASS_RATE_30D),
      this.computeCoveragePct(projectId, allConfigs.COVERAGE_PCT),
      this.computeFlakyRate(projectId, allConfigs.FLAKY_RATE),
      this.computeMTTD(projectId, allConfigs.MTTD_HOURS),
      this.computeMTTR(projectId, allConfigs.MTTR_HOURS),
      this.computeEscapeRate(projectId, allConfigs.ESCAPE_RATE),
      this.computeExecVelocity(projectId, allConfigs.EXEC_VELOCITY),
      this.computeReqCoverage(projectId, allConfigs.REQ_COVERAGE),
      this.computeDefectDensity(projectId, allConfigs.DEFECT_DENSITY),
    ]);

    const [openCriticalCount, totalDefectCount] = await Promise.all([
      this.prisma.defect.count({
        where: {
          projectId,
          deletedAt: null,
          status: { in: openStatuses as any },
          severity: { in: criticalSeverities as any },
        },
      }),
      this.prisma.defect.count({ where: { projectId, deletedAt: null } }),
    ]);

    const criticalRatio =
      totalDefectCount === 0 ? 0 : (openCriticalCount / totalDefectCount) * 100;

    return this.evaluateMetric(cfg, {
      passRate7d: pass7d.value,
      passRate30d: pass30d.value,
      coverage: coverage.value,
      flakyRate: flaky.value,
      mttdHours: mttd.value,
      mttrHours: mttr.value,
      escapeRate: escape.value,
      execVelocity: exec.value,
      reqCoverage: req.value,
      defectDensity: density.value,
      criticalRatio,
    });
  }

  /**
   * Compute a single metric for the formula configurator's live preview.
   * Does not persist a snapshot.
   */
  async previewMetric(
    projectId: string,
    metric: KPIMetricKey,
    cfg: ResolvedFormulaConfig,
  ): Promise<FormulaPreviewResult> {
    const allConfigs =
      metric === 'READINESS_SCORE'
        ? await this.formulaService.resolveAll(projectId)
        : ({} as Record<KPIMetricKey, ResolvedFormulaConfig>);

    const result = await this.runOne(projectId, metric, cfg, allConfigs);
    const hasData =
      !((metric === 'MTTD_HOURS' || metric === 'MTTR_HOURS') && result.value === 0);
    return { metric, value: result.value, hasData, breakdown: result.breakdown };
  }

  async runAggregation(projectId: string): Promise<void> {
    const configs = await this.formulaService.resolveAll(projectId);

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
      defectDensity,
      readinessScore,
    ] = await Promise.all([
      this.computeCoveragePct(projectId, configs.COVERAGE_PCT),
      this.computePassRate(projectId, configs.PASS_RATE_7D),
      this.computePassRate(projectId, configs.PASS_RATE_30D),
      this.computeFlakyRate(projectId, configs.FLAKY_RATE),
      this.computeMTTD(projectId, configs.MTTD_HOURS),
      this.computeMTTR(projectId, configs.MTTR_HOURS),
      this.computeEscapeRate(projectId, configs.ESCAPE_RATE),
      this.computeExecVelocity(projectId, configs.EXEC_VELOCITY),
      this.computeReqCoverage(projectId, configs.REQ_COVERAGE),
      this.computeDefectDensity(projectId, configs.DEFECT_DENSITY),
      this.computeReadinessScore(projectId, configs.READINESS_SCORE, configs),
    ]);

    const now = new Date();
    await this.prisma.kPISnapshot.createMany({
      data: [
        { projectId, metric: 'COVERAGE_PCT' as any, value: coveragePct.value, recordedAt: now },
        { projectId, metric: 'PASS_RATE_7D' as any, value: passRate7d.value, recordedAt: now },
        { projectId, metric: 'PASS_RATE_30D' as any, value: passRate30d.value, recordedAt: now },
        { projectId, metric: 'FLAKY_RATE' as any, value: flakyRate.value, recordedAt: now },
        { projectId, metric: 'MTTD_HOURS' as any, value: mttd.value, recordedAt: now },
        { projectId, metric: 'MTTR_HOURS' as any, value: mttr.value, recordedAt: now },
        { projectId, metric: 'ESCAPE_RATE' as any, value: escapeRate.value, recordedAt: now },
        { projectId, metric: 'EXEC_VELOCITY' as any, value: execVelocity.value, recordedAt: now },
        { projectId, metric: 'REQ_COVERAGE' as any, value: reqCoverage.value, recordedAt: now },
        { projectId, metric: 'READINESS_SCORE' as any, value: readinessScore.value, recordedAt: now },
        { projectId, metric: 'DEFECT_DENSITY' as any, value: defectDensity.value, recordedAt: now },
      ],
    });
  }

  // ─── internals ───────────────────────────────────────────────────────

  private evaluateMetric(
    cfg: ResolvedFormulaConfig,
    variables: Record<string, number>,
  ): { value: number; breakdown: Record<string, number> } {
    const def = KPI_FORMULA_DEFINITIONS[cfg.metric as KPIMetricKey];
    const expression = (cfg.expression?.trim() || def?.defaultExpression || '0').trim();

    let value = 0;
    try {
      const result = Parser.parse(expression).evaluate(variables);
      if (typeof result === 'number' && Number.isFinite(result)) value = result;
    } catch {
      // Persisted expressions are validated at save time; a runtime failure
      // here is exceptional. Fall back to the registry default expression.
      const fallback = def?.defaultExpression;
      if (fallback) {
        try {
          const result = Parser.parse(fallback).evaluate(variables);
          if (typeof result === 'number' && Number.isFinite(result)) value = result;
        } catch {
          /* swallow */
        }
      }
    }
    return { value, breakdown: variables };
  }

  private runOne(
    projectId: string,
    metric: KPIMetricKey,
    cfg: ResolvedFormulaConfig,
    allConfigs: Record<KPIMetricKey, ResolvedFormulaConfig>,
  ): Promise<{ value: number; breakdown: Record<string, number> }> {
    switch (metric) {
      case 'COVERAGE_PCT':
        return this.computeCoveragePct(projectId, cfg);
      case 'PASS_RATE_7D':
      case 'PASS_RATE_30D':
        return this.computePassRate(projectId, cfg);
      case 'FLAKY_RATE':
        return this.computeFlakyRate(projectId, cfg);
      case 'MTTD_HOURS':
        return this.computeMTTD(projectId, cfg);
      case 'MTTR_HOURS':
        return this.computeMTTR(projectId, cfg);
      case 'ESCAPE_RATE':
        return this.computeEscapeRate(projectId, cfg);
      case 'EXEC_VELOCITY':
        return this.computeExecVelocity(projectId, cfg);
      case 'REQ_COVERAGE':
        return this.computeReqCoverage(projectId, cfg);
      case 'DEFECT_DENSITY':
        return this.computeDefectDensity(projectId, cfg);
      case 'READINESS_SCORE':
        return this.computeReadinessScore(projectId, cfg, allConfigs);
    }
  }
}

// ─── helpers ──────────────────────────────────────────────────────────

function asInteger(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  return fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return value as string[];
  return fallback;
}

function meanOf(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function medianOf(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentileOf(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

function countTransitions(statuses: string[]): number {
  if (statuses.length < 2) return 0;
  let n = 0;
  for (let i = 1; i < statuses.length; i++) if (statuses[i] !== statuses[i - 1]) n++;
  return n;
}
