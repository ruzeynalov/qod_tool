import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * Run statuses that count as "unsuccessful" for Run Health and Daily Run
 * Results. CANCELLED and ERRORED runs are not green; treating them as passed
 * (the previous default of "everything that isn't FAILED is implicitly OK")
 * hid CI breakages from the dashboard.
 */
const UNSUCCESSFUL_RUN_STATUSES = ['FAILED', 'ERRORED', 'CANCELLED'] as const;

function isUnsuccessfulRun(status: string): boolean {
  return (UNSUCCESSFUL_RUN_STATUSES as readonly string[]).includes(status);
}

@Injectable()
export class DataService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Project Summary (for project cards) ─────────────────────

  async getProjectSummary(projectId: string) {
    const [testCount, openDefects, latestRun, latestSnapshot] = await Promise.all([
      this.prisma.testCase.count({ where: { projectId, deletedAt: null } }),
      this.prisma.defect.count({
        where: { projectId, deletedAt: null, status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] } },
      }),
      this.prisma.testRun.findFirst({
        where: { projectId, deletedAt: null },
        orderBy: { startedAt: 'desc' },
        select: { startedAt: true },
      }),
      this.prisma.kPISnapshot.findFirst({
        where: { projectId, metric: 'PASS_RATE_7D' as any },
        orderBy: { recordedAt: 'desc' },
        select: { value: true },
      }),
    ]);

    return {
      testCount,
      passRate: latestSnapshot ? Math.round(latestSnapshot.value * 10) / 10 : 0,
      openDefects,
      lastRunAt: latestRun?.startedAt ?? null,
    };
  }

  // ── Test Cases ──────────────────────────────────────────────

  async getTestCaseFilterOptions(projectId: string) {
    const [suiteNames, testRailTypes] = await Promise.all([
      this.prisma.testCase.findMany({
        where: { projectId, deletedAt: null, suiteName: { not: null } },
        distinct: ['suiteName'],
        select: { suiteName: true },
        orderBy: { suiteName: 'asc' },
      }),
      this.prisma.testCase.findMany({
        where: { projectId, deletedAt: null, testRailType: { not: null } },
        distinct: ['testRailType'],
        select: { testRailType: true },
        orderBy: { testRailType: 'asc' },
      }),
    ]);

    return {
      suiteNames: suiteNames.map((r) => r.suiteName!),
      testRailTypes: testRailTypes.map((r) => r.testRailType!),
    };
  }

  async getTestCases(
    projectId: string,
    filters: {
      featureAreaId?: string;
      type?: string;
      automationStatus?: string;
      suiteName?: string;
      testRailType?: string;
      hasReferences?: boolean;
      referenceSearch?: string;
      search?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 25;
    const skip = (page - 1) * pageSize;

    const where: Prisma.TestCaseWhereInput = { projectId, deletedAt: null };
    if (filters.featureAreaId) where.featureAreaId = filters.featureAreaId;
    if (filters.type) where.type = filters.type as any;
    if (filters.automationStatus) where.automationStatus = filters.automationStatus as any;
    if (filters.suiteName) where.suiteName = filters.suiteName;
    if (filters.testRailType) where.testRailType = filters.testRailType;
    if (filters.hasReferences === true) where.references = { not: null };
    if (filters.hasReferences === false) where.references = null;
    if (filters.referenceSearch) where.references = { contains: filters.referenceSearch, mode: 'insensitive' };
    if (filters.search) {
      const searchNoPrefix = /^c/i.test(filters.search) ? filters.search.slice(1) : filters.search;
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { externalId: { contains: filters.search, mode: 'insensitive' } },
        { externalId: { contains: searchNoPrefix, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.testCase.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { featureArea: true },
      }),
      this.prisma.testCase.count({ where }),
    ]);

    return {
      items: items.map((tc) => ({
        id: tc.id,
        externalId: tc.externalId ?? '',
        title: tc.title,
        type: tc.type,
        automationStatus: tc.automationStatus,
        featureAreaId: tc.featureAreaId ?? '',
        tags: tc.tags,
        suiteName: tc.suiteName ?? tc.featureArea?.name ?? '',
        lastExecutedAt: tc.lastExecutedAt,
        references: tc.references,
        testRailType: tc.testRailType,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ── Test Runs ───────────────────────────────────────────────

  async getTestRuns(
    projectId: string,
    filters: {
      status?: string;
      branch?: string;
      environment?: string;
      search?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 25;
    const skip = (page - 1) * pageSize;

    const where: Prisma.TestRunWhereInput = { projectId, deletedAt: null };
    if (filters.status) where.status = filters.status as any;
    if (filters.branch) where.branch = filters.branch;
    if (filters.environment) where.environment = filters.environment;
    if (filters.search) where.name = { contains: filters.search, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      this.prisma.testRun.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.testRun.count({ where }),
    ]);

    return {
      items: items.map((run) => ({
        id: run.id,
        name: run.name ?? `Run ${run.externalId}`,
        triggerType: run.triggerType,
        branch: run.branch ?? '',
        sha: run.sha ?? '',
        environment: run.environment ?? '',
        startedAt: run.startedAt,
        durationMs: run.durationMs ?? 0,
        status: run.status,
        totalTests: run.totalTests,
        passedCount: run.passedCount,
        failedCount: run.failedCount,
        skippedCount: run.skippedCount,
        flakyCount: run.flakyCount,
        pipelineRunId: run.pipelineRunId ?? '',
        isRerun: run.isRerun,
        originalRunId: run.originalRunId ?? null,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ── Test Run Results (lazy-loaded) ────────────────────────

  async getTestRunResults(
    runId: string,
    filters: { page?: number; pageSize?: number },
  ) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.testResult.findMany({
        where: { runId },
        skip,
        take: pageSize,
        orderBy: { status: 'asc' },
        select: {
          id: true,
          status: true,
          durationMs: true,
          errorMessage: true,
          testCase: { select: { id: true, title: true } },
        },
      }),
      this.prisma.testResult.count({ where: { runId } }),
    ]);

    return {
      items: items.map((r) => ({
        id: r.id,
        status: r.status,
        durationMs: r.durationMs ?? 0,
        errorMessage: r.errorMessage ?? null,
        testCaseId: r.testCase.id,
        testTitle: r.testCase.title,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ── Defects ─────────────────────────────────────────────────

  async getDefectFilterOptions(projectId: string) {
    const baseWhere = { projectId, deletedAt: null };
    const openStatuses = ['OPEN', 'IN_PROGRESS', 'REOPENED'] as any;

    const [
      allLabels,
      totalCount,
      openCount,
      escapedCount,
      critHighCount,
      components,
      openDefects,
    ] = await Promise.all([
      this.prisma.defect.findMany({
        where: { ...baseWhere, labels: { isEmpty: false } },
        select: { labels: true },
      }),
      this.prisma.defect.count({ where: baseWhere }),
      this.prisma.defect.count({
        where: { ...baseWhere, status: { in: openStatuses } },
      }),
      this.prisma.defect.count({ where: { ...baseWhere, isEscaped: true } }),
      this.prisma.defect.count({
        where: {
          ...baseWhere,
          status: { in: openStatuses },
          severity: { in: ['CRITICAL', 'HIGH'] },
        },
      }),
      this.prisma.defect.findMany({
        where: { ...baseWhere, component: { not: null } },
        distinct: ['component'],
        select: { component: true },
        orderBy: { component: 'asc' },
      }),
      this.prisma.defect.findMany({
        where: { ...baseWhere, status: { in: openStatuses } },
        select: { createdAt: true },
      }),
    ]);

    const labelSet = new Set<string>();
    for (const row of allLabels) {
      for (const l of row.labels) labelSet.add(l);
    }

    // Compute age distribution buckets server-side
    const now = Date.now();
    const ageBuckets = [0, 0, 0, 0, 0, 0, 0, 0, 0]; // <1d, 1-3d, 3-7d, 1-2w, 2-4w, 1-3m, 3-6m, 6m-1y, >1y
    for (const d of openDefects) {
      const days = (now - new Date(d.createdAt).getTime()) / 86_400_000;
      if (days < 1) ageBuckets[0]++;
      else if (days < 3) ageBuckets[1]++;
      else if (days < 7) ageBuckets[2]++;
      else if (days < 14) ageBuckets[3]++;
      else if (days < 28) ageBuckets[4]++;
      else if (days < 90) ageBuckets[5]++;
      else if (days < 180) ageBuckets[6]++;
      else if (days < 365) ageBuckets[7]++;
      else ageBuckets[8]++;
    }

    return {
      labels: [...labelSet].sort(),
      components: components.map((c) => c.component!).filter(Boolean),
      totalCount,
      openCount,
      escapedCount,
      critHighCount,
      ageBuckets,
    };
  }

  async getDefects(
    projectId: string,
    filters: {
      severity?: string;
      status?: string;
      featureAreaId?: string;
      label?: string;
      search?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 25;
    const skip = (page - 1) * pageSize;

    const where: Prisma.DefectWhereInput = { projectId, deletedAt: null };
    if (filters.severity) where.severity = filters.severity as any;
    if (filters.status) where.status = filters.status as any;
    if (filters.featureAreaId) where.featureAreaId = filters.featureAreaId;
    if (filters.label) where.labels = { has: filters.label };
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { externalId: { contains: filters.search, mode: 'insensitive' } },
        { component: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.defect.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.defect.count({ where }),
    ]);

    return {
      items: items.map((d) => ({
        id: d.id,
        externalId: d.externalId ?? '',
        url: d.url ?? null,
        title: d.title,
        severity: d.severity,
        priority: d.priority,
        status: d.status,
        component: d.component ?? '',
        featureAreaId: d.featureAreaId ?? '',
        labels: d.labels,
        isEscaped: d.isEscaped,
        reopenCount: d.reopenCount,
        createdAt: d.createdAt,
        resolvedAt: d.resolvedAt,
        closedAt: d.closedAt,
        changelog: (d.changelog as any) ?? [],
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ── Story Filter Options ────────────────────────────────────

  async getStoryFilterOptions(projectId: string) {
    const [components, allLabels] = await Promise.all([
      this.prisma.story.findMany({
        where: { projectId, component: { not: null } },
        distinct: ['component'],
        select: { component: true },
        orderBy: { component: 'asc' },
      }),
      this.prisma.story.findMany({
        where: { projectId, labels: { isEmpty: false } },
        select: { labels: true },
      }),
    ]);

    const labelSet = new Set<string>();
    for (const row of allLabels) {
      for (const l of row.labels) labelSet.add(l);
    }

    return {
      components: components.map((r) => r.component!),
      labels: [...labelSet].sort(),
    };
  }

  // ── Stories ────────────────────────────────────────────────

  async getStories(
    projectId: string,
    filters: {
      status?: string;
      component?: string;
      label?: string;
      search?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 25;
    const skip = (page - 1) * pageSize;

    const where: Prisma.StoryWhereInput = { projectId };
    if (filters.status) where.status = filters.status as any;
    if (filters.component) where.component = filters.component;
    if (filters.label) where.labels = { has: filters.label };
    if (filters.search) where.title = { contains: filters.search, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      this.prisma.story.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.story.count({ where }),
    ]);

    return {
      items: items.map((s) => ({
        id: s.id,
        externalId: s.externalId ?? '',
        title: s.title,
        url: s.url,
        status: s.status,
        storyPoints: s.storyPoints,
        assignee: s.assignee,
        component: s.component,
        labels: s.labels,
        createdAt: s.createdAt,
        resolvedAt: s.resolvedAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ── Pipeline Runs ───────────────────────────────────────────

  async getPipelineRuns(projectId: string) {
    const runs = await this.prisma.pipelineRun.findMany({
      where: { projectId },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });

    return runs.map((r) => ({
      id: r.id,
      workflowName: r.workflowName,
      branch: r.branch ?? '',
      sha: r.sha ?? '',
      status: r.status === 'SUCCESS' ? 'SUCCESS' : 'FAILURE',
      durationMs: r.durationMs ?? 0,
      triggeredBy: r.triggeredBy ?? '',
      startedAt: r.startedAt,
    }));
  }

  // ── Test Case History ───────────────────────────────────────

  async getTestCaseHistory(projectId: string, testCaseId: string) {
    const results = await this.prisma.testResult.findMany({
      where: {
        testCaseId,
        run: { projectId },
      },
      orderBy: { run: { startedAt: 'desc' } },
      take: 200,
      include: {
        run: { select: { name: true, branch: true, environment: true, startedAt: true } },
      },
    });

    // Deduplicate: one result per run (first encountered = latest by startedAt)
    const byRun = new Map<string, typeof results[0]>();
    for (const r of results) {
      if (!byRun.has(r.runId)) {
        byRun.set(r.runId, r);
      }
    }

    return Array.from(byRun.values())
      .sort((a, b) => new Date(b.run.startedAt).getTime() - new Date(a.run.startedAt).getTime())
      .slice(0, 50)
      .map((r) => ({
        runId: r.runId,
        runName: r.run.name ?? '',
        date: r.run.startedAt,
        status: r.status,
        durationMs: r.durationMs ?? 0,
        errorMessage: r.errorMessage ?? undefined,
        branch: r.run.branch ?? '',
        environment: r.run.environment ?? '',
      }));
  }

  // ── Analytics: Pass Rate Trend ──────────────────────────────

  async getPassRateTrend(projectId: string, days: number) {
    const effectiveDays = Math.min(days, 365);
    const since = new Date(Date.now() - effectiveDays * 86400000);

    const runs = await this.prisma.testRun.findMany({
      where: { projectId, startedAt: { gte: since } },
      orderBy: { startedAt: 'asc' },
      select: { startedAt: true, status: true, totalTests: true, passedCount: true },
    });

    const byDay = new Map<string, { total: number; passed: number; passedRuns: number; failedRuns: number; totalRuns: number }>();
    for (const run of runs) {
      const day = run.startedAt.toISOString().slice(0, 10);
      const entry = byDay.get(day) ?? { total: 0, passed: 0, passedRuns: 0, failedRuns: 0, totalRuns: 0 };
      entry.total += run.totalTests;
      entry.passed += run.passedCount;
      entry.totalRuns++;
      if (run.status === 'PASSED') entry.passedRuns++;
      else if (isUnsuccessfulRun(run.status)) entry.failedRuns++;
      byDay.set(day, entry);
    }

    return Array.from(byDay.entries()).map(([date, { total, passed, passedRuns, failedRuns, totalRuns }]) => ({
      date,
      passRate: total > 0 ? Math.round((passed / total) * 1000) / 10 : 0,
      totalTests: total,
      totalRuns,
      passedRuns,
      failedRuns,
    }));
  }

  // ── Analytics: Coverage ─────────────────────────────────────

  async getCoverageData(projectId: string) {
    const areas = await this.prisma.featureArea.findMany({
      where: { projectId },
      take: 200,
      include: {
        testCases: { select: { id: true, automationStatus: true } },
      },
    });

    if (areas.length > 0) {
      return areas.map((area) => this.mapCoverageGroup(area.id, area.name, area.testCases));
    }

    // Fallback: group by suiteName when no feature areas are defined
    const testCases = await this.prisma.testCase.findMany({
      where: { projectId, suiteName: { not: null } },
      select: { suiteName: true, automationStatus: true },
    });

    const bySuite = new Map<string, { automationStatus: string }[]>();
    for (const tc of testCases) {
      const name = tc.suiteName!;
      const arr = bySuite.get(name) ?? [];
      arr.push({ automationStatus: tc.automationStatus });
      bySuite.set(name, arr);
    }

    return Array.from(bySuite.entries())
      .sort(([, a], [, b]) => b.length - a.length)
      .map(([name, cases]) => this.mapCoverageGroup(name, name, cases));
  }

  private mapCoverageGroup(
    id: string,
    name: string,
    cases: { automationStatus: string }[],
  ) {
    const total = cases.length;
    const automated = cases.filter((tc) => tc.automationStatus === 'AUTOMATED').length;
    const manual = cases.filter((tc) => tc.automationStatus === 'NOT_AUTOMATED').length;
    const needsUpdate = cases.filter((tc) => tc.automationStatus === 'NEEDS_UPDATE').length;
    return {
      featureAreaId: id,
      featureAreaName: name,
      totalTestCases: total,
      automatedCount: automated,
      manualCount: manual,
      needsUpdateCount: needsUpdate,
      automationPct: total > 0 ? Math.round((automated / total) * 1000) / 10 : 0,
    };
  }

  // ── Analytics: Epic Coverage ────────────────────────────────

  async getEpicCoverage(projectId: string) {
    // Get all epics with their stories
    const epics = await this.prisma.epic.findMany({
      where: { projectId },
      take: 200,
      include: {
        stories: {
          select: { externalId: true, title: true, url: true, status: true, storyPoints: true },
        },
      },
      orderBy: { title: 'asc' },
    });

    // Get all test cases with references (PS-xxxx links to stories)
    const testCases = await this.prisma.testCase.findMany({
      where: { projectId, references: { not: null } },
      select: { id: true, externalId: true, title: true, references: true, automationStatus: true },
    });

    // Build maps: storyExternalId → { totalTCs, automatedTCs } and storyExternalId → TC details
    const tcByStory = new Map<string, { total: number; automated: number }>();
    const tcDetailsByStory = new Map<string, { id: string; externalId: string | null; title: string; automationStatus: string }[]>();
    for (const tc of testCases) {
      const matches = (tc.references || '').match(/[A-Z]+-\d+/g);
      if (!matches) continue;
      for (const ref of matches) {
        const entry = tcByStory.get(ref) || { total: 0, automated: 0 };
        entry.total++;
        if (tc.automationStatus === 'AUTOMATED') entry.automated++;
        tcByStory.set(ref, entry);

        const details = tcDetailsByStory.get(ref) || [];
        details.push({ id: tc.id, externalId: tc.externalId, title: tc.title, automationStatus: tc.automationStatus });
        tcDetailsByStory.set(ref, details);
      }
    }

    return epics.map((epic) => {
      const totalStories = epic.stories.length;
      const totalPoints = epic.stories.reduce((s, st) => s + (st.storyPoints ?? 0), 0);
      let storiesWithTCs = 0;
      let totalTCs = 0;
      let automatedTCs = 0;

      const stories = epic.stories.map((story) => {
        const tc = tcByStory.get(story.externalId!);
        const tcDetails = tcDetailsByStory.get(story.externalId!) || [];
        if (tc) {
          storiesWithTCs++;
          totalTCs += tc.total;
          automatedTCs += tc.automated;
        }
        return {
          externalId: story.externalId,
          title: story.title,
          url: story.url,
          status: story.status,
          storyPoints: story.storyPoints,
          totalTCs: tc?.total ?? 0,
          automatedTCs: tc?.automated ?? 0,
          testCases: tcDetails,
        };
      });

      const closedStories = epic.stories.filter(
        (s) => s.status === 'CLOSED' || s.status === 'RESOLVED',
      ).length;

      return {
        epicId: epic.id,
        externalId: epic.externalId,
        title: epic.title,
        url: epic.url,
        status: epic.status,
        totalStories,
        closedStories,
        totalPoints,
        storiesWithTCs,
        storiesCoveragePct: totalStories > 0
          ? Math.round((storiesWithTCs / totalStories) * 1000) / 10
          : 0,
        totalTCs,
        automatedTCs,
        automationPct: totalTCs > 0
          ? Math.round((automatedTCs / totalTCs) * 1000) / 10
          : 0,
        stories,
      };
    });
  }

  // ── Analytics: Defect Trend ─────────────────────────────────

  async getDefectTrend(projectId: string) {
    const since = new Date(Date.now() - 90 * 86400000);

    // Fetch defects created OR resolved in the last 90 days
    const defects = await this.prisma.defect.findMany({
      where: {
        projectId,
        deletedAt: null,
        OR: [
          { createdAt: { gte: since } },
          { resolvedAt: { gte: since } },
        ],
      },
      take: 10000,
      select: { createdAt: true, resolvedAt: true },
    });

    const byDay = new Map<string, { opened: number; resolved: number }>();
    for (const d of defects) {
      if (d.createdAt >= since) {
        const day = d.createdAt.toISOString().slice(0, 10);
        const entry = byDay.get(day) ?? { opened: 0, resolved: 0 };
        entry.opened++;
        byDay.set(day, entry);
      }
      if (d.resolvedAt && d.resolvedAt >= since) {
        const day = d.resolvedAt.toISOString().slice(0, 10);
        const entry = byDay.get(day) ?? { opened: 0, resolved: 0 };
        entry.resolved++;
        byDay.set(day, entry);
      }
    }

    // Fill in missing days so the chart has no gaps
    const result: { date: string; opened: number; closed: number }[] = [];
    const cursor = new Date(since);
    const today = new Date();
    while (cursor <= today) {
      const key = cursor.toISOString().slice(0, 10);
      const entry = byDay.get(key);
      result.push({ date: key, opened: entry?.opened ?? 0, closed: entry?.resolved ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    return result;
  }

  // ── Analytics: Flaky Tests ──────────────────────────────────

  async getFlakyTests(projectId: string) {
    // Step 1: Get runs from the last 90 days. Old runs accumulate across
    // syncs and are never pruned, so an unbounded query inflates flaky rate.
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);
    const recentRuns = await this.prisma.testRun.findMany({
      where: { projectId, deletedAt: null, startedAt: { gte: ninetyDaysAgo } },
      orderBy: { startedAt: 'desc' },
      select: { id: true, startedAt: true },
    });

    if (recentRuns.length === 0) return [];

    const runIds = recentRuns.map((r) => r.id);
    const runDateMap = new Map(recentRuns.map((r) => [r.id, r.startedAt]));

    // Step 2: Get automated test cases with results from those runs
    const testCases = await this.prisma.testCase.findMany({
      where: { projectId, automationStatus: 'AUTOMATED', deletedAt: null },
      select: {
        id: true,
        title: true,
        suiteName: true,
        featureAreaId: true,
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

    const flakyTests: {
      testCaseId: string;
      testTitle: string;
      featureAreaId: string;
      flakyCount: number;
      totalExecutions: number;
      flakyRate: number;
      lastFlakyAt: Date;
    }[] = [];

    for (const tc of testCases) {
      if (tc.testResults.length === 0) continue;

      // Deduplicate: keep the latest result per run (last wins).
      // We promote a run's status to FLAKY if any retry within that run was
      // FLAKY — within-run retry disagreement is itself a flakiness signal,
      // not just cross-run transitions.
      const byRun = new Map<string, { status: string; startedAt: Date }>();
      for (const r of tc.testResults) {
        const startedAt = runDateMap.get(r.runId)!;
        const existing = byRun.get(r.runId);
        const next = existing && existing.status === 'FLAKY'
          ? existing.status
          : (r.status === 'FLAKY' ? 'FLAKY' : r.status);
        byRun.set(r.runId, { status: next, startedAt });
      }

      // Sort by run date, newest first
      const runStatuses = Array.from(byRun.values())
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

      // Count direct FLAKY hits (within-run retry disagreement, surfaced by
      // the GitHub connector or by report parsers).
      const flakyRunsCount = runStatuses.filter((r) => r.status === 'FLAKY').length;
      const lastFlakyRun = runStatuses.find((r) => r.status === 'FLAKY');

      // Count PASS↔FAIL cross-run transitions. FLAKY rows are deliberately
      // excluded here so we don't double-count them — a FLAKY between two
      // PASSes would otherwise show as 2 transitions plus 1 direct hit.
      const transitionRelevant = runStatuses.filter(
        (r) => r.status === 'PASSED' || r.status === 'FAILED',
      );
      let transitions = 0;
      let lastTransitionAt: Date | null = null;
      for (let i = 1; i < transitionRelevant.length; i++) {
        if (transitionRelevant[i].status !== transitionRelevant[i - 1].status) {
          transitions++;
          if (!lastTransitionAt) {
            lastTransitionAt = transitionRelevant[i - 1].startedAt;
          }
        }
      }

      // A test is flaky if it has at least one FLAKY run, OR at least 2
      // PASS↔FAIL transitions (PASS→FAIL→PASS / FAIL→PASS→FAIL).
      const isFlaky = flakyRunsCount > 0 || transitions >= 2;
      if (!isFlaky) continue;

      // Single source of truth for both count and rate numerator — pick the
      // stronger signal between within-run flakes and cross-run transitions
      // instead of summing them.
      const flakyEvents = Math.max(flakyRunsCount, transitions);
      const totalExecutions = runStatuses.length;
      const denom = Math.max(totalExecutions - 1, 1);
      const flakyRate = Math.min(100, (flakyEvents / denom) * 100);

      // Use the newest of the two flakiness signals so the Flaky Tests list
      // (sorted by lastFlakyAt desc) surfaces the most recently unstable
      // tests first. Picking lastFlakyRun unconditionally would backdate the
      // entry when an older FLAKY row coexists with a newer PASS↔FAIL
      // transition — that's the mixed case Codex flagged.
      const candidates = [lastFlakyRun?.startedAt, lastTransitionAt].filter(
        (d): d is Date => d != null,
      );
      const lastFlakyAt = candidates.length > 0
        ? new Date(Math.max(...candidates.map((d) => d.getTime())))
        : (runStatuses[0]?.startedAt ?? new Date());

      flakyTests.push({
        testCaseId: tc.id,
        testTitle: tc.title,
        featureAreaId: tc.featureAreaId ?? '',
        flakyCount: flakyEvents,
        totalExecutions,
        flakyRate,
        lastFlakyAt,
      });
    }

    // Sort by most recently flaky first
    return flakyTests.sort((a, b) => b.lastFlakyAt.getTime() - a.lastFlakyAt.getTime());
  }

  // ── Analytics: Severity Breakdown ───────────────────────────

  async getSeverityBreakdown(projectId: string) {
    const counts = await this.prisma.defect.groupBy({
      by: ['severity'],
      where: { projectId },
      _count: true,
    });

    return counts.map((c) => ({
      severity: c.severity,
      count: c._count,
    }));
  }

  // ── Analytics: Rerun Stats ──────────────────────────────────

  async getRerunStats(projectId: string) {
    const since = new Date(Date.now() - 30 * 86400000);

    const runs = await this.prisma.testRun.findMany({
      where: { projectId, startedAt: { gte: since } },
      orderBy: { startedAt: 'asc' },
      select: { startedAt: true, status: true, isRerun: true },
    });

    const totalRuns = runs.length;
    const rerunCount = runs.filter((r) => r.isRerun).length;
    const originalRuns = runs.filter((r) => !r.isRerun);
    // Count FAILED, ERRORED, and CANCELLED as unsuccessful — previously only
    // literal FAILED counted, so timed-out/cancelled CI runs slipped through
    // and made Run Health look healthier than it actually was.
    const originalFailed = originalRuns.filter((r) => isUnsuccessfulRun(r.status)).length;

    // Build daily breakdown
    const byDay = new Map<string, { original: number; reruns: number; passed: number; failed: number }>();
    for (const run of runs) {
      const day = run.startedAt.toISOString().slice(0, 10);
      const entry = byDay.get(day) ?? { original: 0, reruns: 0, passed: 0, failed: 0 };
      if (run.isRerun) {
        entry.reruns++;
      } else {
        entry.original++;
      }
      if (run.status === 'PASSED') entry.passed++;
      else if (isUnsuccessfulRun(run.status)) entry.failed++;
      byDay.set(day, entry);
    }

    const rerunsByDay = Array.from(byDay.entries())
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalRuns,
      rerunCount,
      rerunRate: totalRuns > 0 ? Math.round((rerunCount / totalRuns) * 1000) / 10 : 0,
      originalFailRate: originalRuns.length > 0
        ? Math.round((originalFailed / originalRuns.length) * 1000) / 10
        : 0,
      maskedFailRate: 0,
      rerunsByDay,
    };
  }

  // ── Analytics: Defect Timing ────────────────────────────────

  async getDefectTimingStats(projectId: string) {
    const [defects, allDefects] = await Promise.all([
      this.prisma.defect.findMany({
        where: { projectId, resolvedAt: { not: null } },
        select: { createdAt: true, resolvedAt: true, severity: true },
      }),
      this.prisma.defect.findMany({
        where: { projectId, deletedAt: null },
        select: { createdAt: true, resolvedAt: true, closedAt: true, status: true },
      }),
    ]);

    if (defects.length === 0 && allDefects.length === 0) {
      return { avgMTTDHours: 0, avgMTTRHours: 0, medianMTTRHours: 0, mttrBySeverity: [], mttrTrend: [], openBurndown: [] };
    }

    if (defects.length === 0) {
      // No resolved defects but we have open ones — still compute burndown
      return {
        avgMTTDHours: 0, avgMTTRHours: 0, medianMTTRHours: 0, mttrBySeverity: [], mttrTrend: [],
        openBurndown: this.computeOpenBurndown(allDefects),
      };
    }

    const mttrHours = defects.map((d) => {
      const ms = (d.resolvedAt as Date).getTime() - d.createdAt.getTime();
      return ms / 3600000;
    });
    mttrHours.sort((a, b) => a - b);

    const avg = mttrHours.reduce((s, v) => s + v, 0) / mttrHours.length;
    const median = mttrHours[Math.floor(mttrHours.length / 2)];

    const bySeverity = new Map<string, number[]>();
    for (const d of defects) {
      const ms = (d.resolvedAt as Date).getTime() - d.createdAt.getTime();
      const hours = ms / 3600000;
      const arr = bySeverity.get(d.severity) ?? [];
      arr.push(hours);
      bySeverity.set(d.severity, arr);
    }

    // Weekly MTTR trend (last 12 weeks)
    const byWeek = new Map<string, number[]>();
    for (const d of defects) {
      const resolved = new Date(d.resolvedAt as Date);
      // Week start (Monday)
      const day = resolved.getDay();
      const monday = new Date(resolved);
      monday.setDate(resolved.getDate() - ((day + 6) % 7));
      const weekKey = monday.toISOString().slice(0, 10);
      const hours = ((d.resolvedAt as Date).getTime() - d.createdAt.getTime()) / 3_600_000;
      const arr = byWeek.get(weekKey) ?? [];
      arr.push(hours);
      byWeek.set(weekKey, arr);
    }
    const mttrTrend = Array.from(byWeek.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([week, hours]) => ({
        week,
        avgHours: Math.round((hours.reduce((s, v) => s + v, 0) / hours.length) * 10) / 10,
      }));

    return {
      avgMTTDHours: 0,
      avgMTTRHours: Math.round(avg * 10) / 10,
      medianMTTRHours: Math.round(median * 10) / 10,
      mttrBySeverity: Array.from(bySeverity.entries()).map(([severity, hours]) => ({
        severity,
        avgHours: Math.round((hours.reduce((s, v) => s + v, 0) / hours.length) * 10) / 10,
      })),
      mttrTrend,
      openBurndown: this.computeOpenBurndown(allDefects),
    };
  }

  private computeOpenBurndown(
    defects: Array<{ createdAt: Date; resolvedAt: Date | null; closedAt: Date | null; status: string }>,
  ): Array<{ week: string; open: number }> {
    if (defects.length === 0) return [];

    // Find the earliest creation date, clamp to last 12 weeks
    const now = new Date();
    const twelveWeeksAgo = new Date(now);
    twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

    // Generate weekly checkpoints (Mondays)
    const weeks: Date[] = [];
    const cursor = new Date(twelveWeeksAgo);
    const day = cursor.getDay();
    cursor.setDate(cursor.getDate() - ((day + 6) % 7)); // snap to Monday
    while (cursor <= now) {
      weeks.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 7);
    }

    // For each week checkpoint, count how many defects were open at that point
    const openStatuses = new Set(['OPEN', 'IN_PROGRESS', 'REOPENED']);
    return weeks.map((weekStart) => {
      const endOfWeek = new Date(weekStart);
      endOfWeek.setDate(endOfWeek.getDate() + 7);
      let openCount = 0;
      for (const d of defects) {
        const created = new Date(d.createdAt);
        if (created > endOfWeek) continue; // not yet created
        const closed = d.resolvedAt ?? d.closedAt;
        if (closed && new Date(closed) <= endOfWeek) continue; // already resolved
        // If no resolution date but status is resolved/closed (e.g. Jira "Won't Do"),
        // treat as not open
        if (!closed && !openStatuses.has(d.status)) continue;
        openCount++;
      }
      return { week: weekStart.toISOString().slice(0, 10), open: openCount };
    });
  }
}
