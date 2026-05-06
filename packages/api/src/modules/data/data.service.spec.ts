import { createPrismaMock, PrismaMock } from '../../common/utils/prisma-mock';
import { DataService } from './data.service';
import { PrismaService } from '../../database/prisma.service';

describe('DataService', () => {
  let service: DataService;
  let prisma: PrismaMock;

  const projectId = 'proj-uuid-1';

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new DataService(prisma as unknown as PrismaService);
  });

  // ── getProjectSummary ───────────────────────────────────────

  describe('getProjectSummary()', () => {
    it('should return summary with all fields populated', async () => {
      const startedAt = new Date('2026-03-01');
      prisma.testCase.count.mockResolvedValue(150);
      prisma.defect.count.mockResolvedValue(12);
      prisma.testRun.findFirst.mockResolvedValue({ startedAt });
      prisma.kPISnapshot.findFirst.mockResolvedValue({ value: 94.56 });

      const result = await service.getProjectSummary(projectId);

      expect(result).toEqual({
        testCount: 150,
        passRate: 94.6,
        openDefects: 12,
        lastRunAt: startedAt,
      });
    });

    it('should return zero passRate when no snapshot exists', async () => {
      prisma.testCase.count.mockResolvedValue(0);
      prisma.defect.count.mockResolvedValue(0);
      prisma.testRun.findFirst.mockResolvedValue(null);
      prisma.kPISnapshot.findFirst.mockResolvedValue(null);

      const result = await service.getProjectSummary(projectId);

      expect(result.passRate).toBe(0);
      expect(result.lastRunAt).toBeNull();
    });

    it('should count only OPEN, IN_PROGRESS, REOPENED defects', async () => {
      prisma.testCase.count.mockResolvedValue(0);
      prisma.defect.count.mockResolvedValue(5);
      prisma.testRun.findFirst.mockResolvedValue(null);
      prisma.kPISnapshot.findFirst.mockResolvedValue(null);

      await service.getProjectSummary(projectId);

      expect(prisma.defect.count).toHaveBeenCalledWith({
        where: { projectId, deletedAt: null, status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] } },
      });
    });

    it('should query the latest test run by startedAt desc', async () => {
      prisma.testCase.count.mockResolvedValue(0);
      prisma.defect.count.mockResolvedValue(0);
      prisma.testRun.findFirst.mockResolvedValue(null);
      prisma.kPISnapshot.findFirst.mockResolvedValue(null);

      await service.getProjectSummary(projectId);

      expect(prisma.testRun.findFirst).toHaveBeenCalledWith({
        where: { projectId, deletedAt: null },
        orderBy: { startedAt: 'desc' },
        select: { startedAt: true },
      });
    });

    it('should round passRate to one decimal place', async () => {
      prisma.testCase.count.mockResolvedValue(10);
      prisma.defect.count.mockResolvedValue(0);
      prisma.testRun.findFirst.mockResolvedValue(null);
      prisma.kPISnapshot.findFirst.mockResolvedValue({ value: 97.777 });

      const result = await service.getProjectSummary(projectId);

      expect(result.passRate).toBe(97.8);
    });
  });

  // ── getTestCaseFilterOptions ────────────────────────────────

  describe('getTestCaseFilterOptions()', () => {
    it('should return distinct suiteNames and testRailTypes', async () => {
      prisma.testCase.findMany
        .mockResolvedValueOnce([{ suiteName: 'Auth' }, { suiteName: 'Billing' }])
        .mockResolvedValueOnce([{ testRailType: 'Functional' }, { testRailType: 'Regression' }]);

      const result = await service.getTestCaseFilterOptions(projectId);

      expect(result).toEqual({
        suiteNames: ['Auth', 'Billing'],
        testRailTypes: ['Functional', 'Regression'],
      });
    });

    it('should return empty arrays when no data exists', async () => {
      prisma.testCase.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getTestCaseFilterOptions(projectId);

      expect(result).toEqual({ suiteNames: [], testRailTypes: [] });
    });

    it('should filter out null suiteNames in the query', async () => {
      prisma.testCase.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.getTestCaseFilterOptions(projectId);

      const firstCall = prisma.testCase.findMany.mock.calls[0][0];
      expect(firstCall.where.suiteName).toEqual({ not: null });
    });
  });

  // ── getTestCases ──────────────────────────────────────────

  describe('getTestCases()', () => {
    const makeTestCase = (id: string, overrides = {}) => ({
      id,
      externalId: `ext-${id}`,
      title: `Test ${id}`,
      type: 'FUNCTIONAL',
      automationStatus: 'AUTOMATED',
      featureAreaId: 'fa-1',
      tags: ['smoke'],
      suiteName: 'Login',
      lastExecutedAt: new Date('2026-03-01'),
      references: 'REF-001',
      testRailType: 'Acceptance',
      featureArea: { name: 'Auth' },
      ...overrides,
    });

    it('should return paginated test cases with default page/pageSize', async () => {
      const items = [makeTestCase('tc-1'), makeTestCase('tc-2')];
      prisma.testCase.findMany.mockResolvedValue(items);
      prisma.testCase.count.mockResolvedValue(2);

      const result = await service.getTestCases(projectId, {});

      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(25);
      expect(result.total).toBe(2);
      expect(result.totalPages).toBe(1);
      expect(result.items).toHaveLength(2);
    });

    it('should calculate totalPages correctly', async () => {
      prisma.testCase.findMany.mockResolvedValue([]);
      prisma.testCase.count.mockResolvedValue(51);

      const result = await service.getTestCases(projectId, { pageSize: 25 });

      expect(result.totalPages).toBe(3);
    });

    it('should apply pagination skip/take', async () => {
      prisma.testCase.findMany.mockResolvedValue([]);
      prisma.testCase.count.mockResolvedValue(0);

      await service.getTestCases(projectId, { page: 3, pageSize: 10 });

      expect(prisma.testCase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('should apply featureAreaId filter', async () => {
      prisma.testCase.findMany.mockResolvedValue([]);
      prisma.testCase.count.mockResolvedValue(0);

      await service.getTestCases(projectId, { featureAreaId: 'fa-1' });

      const call = prisma.testCase.findMany.mock.calls[0][0];
      expect(call.where.featureAreaId).toBe('fa-1');
    });

    it('should apply type filter', async () => {
      prisma.testCase.findMany.mockResolvedValue([]);
      prisma.testCase.count.mockResolvedValue(0);

      await service.getTestCases(projectId, { type: 'REGRESSION' });

      const call = prisma.testCase.findMany.mock.calls[0][0];
      expect(call.where.type).toBe('REGRESSION');
    });

    it('should apply automationStatus filter', async () => {
      prisma.testCase.findMany.mockResolvedValue([]);
      prisma.testCase.count.mockResolvedValue(0);

      await service.getTestCases(projectId, { automationStatus: 'NOT_AUTOMATED' });

      const call = prisma.testCase.findMany.mock.calls[0][0];
      expect(call.where.automationStatus).toBe('NOT_AUTOMATED');
    });

    it('should apply suiteName filter', async () => {
      prisma.testCase.findMany.mockResolvedValue([]);
      prisma.testCase.count.mockResolvedValue(0);

      await service.getTestCases(projectId, { suiteName: 'Checkout' });

      const call = prisma.testCase.findMany.mock.calls[0][0];
      expect(call.where.suiteName).toBe('Checkout');
    });

    it('should apply testRailType filter', async () => {
      prisma.testCase.findMany.mockResolvedValue([]);
      prisma.testCase.count.mockResolvedValue(0);

      await service.getTestCases(projectId, { testRailType: 'Smoke' });

      const call = prisma.testCase.findMany.mock.calls[0][0];
      expect(call.where.testRailType).toBe('Smoke');
    });

    it('should apply hasReferences=true filter', async () => {
      prisma.testCase.findMany.mockResolvedValue([]);
      prisma.testCase.count.mockResolvedValue(0);

      await service.getTestCases(projectId, { hasReferences: true });

      const call = prisma.testCase.findMany.mock.calls[0][0];
      expect(call.where.references).toEqual({ not: null });
    });

    it('should apply hasReferences=false filter', async () => {
      prisma.testCase.findMany.mockResolvedValue([]);
      prisma.testCase.count.mockResolvedValue(0);

      await service.getTestCases(projectId, { hasReferences: false });

      const call = prisma.testCase.findMany.mock.calls[0][0];
      expect(call.where.references).toBeNull();
    });

    it('should apply referenceSearch filter with insensitive mode', async () => {
      prisma.testCase.findMany.mockResolvedValue([]);
      prisma.testCase.count.mockResolvedValue(0);

      await service.getTestCases(projectId, { referenceSearch: 'REF-001' });

      const call = prisma.testCase.findMany.mock.calls[0][0];
      expect(call.where.references).toEqual({ contains: 'REF-001', mode: 'insensitive' });
    });

    it('should apply search filter on title and externalId with insensitive mode', async () => {
      prisma.testCase.findMany.mockResolvedValue([]);
      prisma.testCase.count.mockResolvedValue(0);

      await service.getTestCases(projectId, { search: 'login' });

      const call = prisma.testCase.findMany.mock.calls[0][0];
      expect(call.where.OR).toEqual([
        { title: { contains: 'login', mode: 'insensitive' } },
        { externalId: { contains: 'login', mode: 'insensitive' } },
        { externalId: { contains: 'login', mode: 'insensitive' } },
      ]);
    });

    it('should strip C prefix when searching by test case ID', async () => {
      prisma.testCase.findMany.mockResolvedValue([]);
      prisma.testCase.count.mockResolvedValue(0);

      await service.getTestCases(projectId, { search: 'C72366' });

      const call = prisma.testCase.findMany.mock.calls[0][0];
      expect(call.where.OR).toEqual([
        { title: { contains: 'C72366', mode: 'insensitive' } },
        { externalId: { contains: 'C72366', mode: 'insensitive' } },
        { externalId: { contains: '72366', mode: 'insensitive' } },
      ]);
    });

    it('should use featureArea name as suiteName fallback', async () => {
      const tc = makeTestCase('tc-1', { suiteName: null, featureArea: { name: 'Auth Module' } });
      prisma.testCase.findMany.mockResolvedValue([tc]);
      prisma.testCase.count.mockResolvedValue(1);

      const result = await service.getTestCases(projectId, {});

      expect(result.items[0].suiteName).toBe('Auth Module');
    });

    it('should return empty suiteName when both suiteName and featureArea are absent', async () => {
      const tc = makeTestCase('tc-1', { suiteName: null, featureArea: null });
      prisma.testCase.findMany.mockResolvedValue([tc]);
      prisma.testCase.count.mockResolvedValue(1);

      const result = await service.getTestCases(projectId, {});

      expect(result.items[0].suiteName).toBe('');
    });

    it('should map externalId to empty string when null', async () => {
      const tc = makeTestCase('tc-1', { externalId: null });
      prisma.testCase.findMany.mockResolvedValue([tc]);
      prisma.testCase.count.mockResolvedValue(1);

      const result = await service.getTestCases(projectId, {});

      expect(result.items[0].externalId).toBe('');
    });

    it('should return empty items when no test cases match', async () => {
      prisma.testCase.findMany.mockResolvedValue([]);
      prisma.testCase.count.mockResolvedValue(0);

      const result = await service.getTestCases(projectId, {});

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });
  });

  // ── getTestRuns ────────────────────────────────────────────

  describe('getTestRuns()', () => {
    const makeRun = (id: string, overrides = {}) => ({
      id,
      externalId: 'ext-1',
      name: `Run ${id}`,
      triggerType: 'PUSH',
      branch: 'main',
      sha: 'abc123',
      environment: 'staging',
      startedAt: new Date('2026-03-01'),
      durationMs: 120000,
      status: 'PASSED',
      totalTests: 100,
      passedCount: 95,
      failedCount: 3,
      skippedCount: 2,
      flakyCount: 1,
      pipelineRunId: 'pipe-1',
      isRerun: false,
      originalRunId: null,
      ...overrides,
    });

    it('should return paginated test runs', async () => {
      const items = [makeRun('run-1'), makeRun('run-2')];
      prisma.testRun.findMany.mockResolvedValue(items);
      prisma.testRun.count.mockResolvedValue(2);

      const result = await service.getTestRuns(projectId, {});

      expect(result.items).toHaveLength(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(25);
      expect(result.total).toBe(2);
    });

    it('should apply status filter', async () => {
      prisma.testRun.findMany.mockResolvedValue([]);
      prisma.testRun.count.mockResolvedValue(0);

      await service.getTestRuns(projectId, { status: 'FAILED' });

      const call = prisma.testRun.findMany.mock.calls[0][0];
      expect(call.where.status).toBe('FAILED');
    });

    it('should apply branch filter', async () => {
      prisma.testRun.findMany.mockResolvedValue([]);
      prisma.testRun.count.mockResolvedValue(0);

      await service.getTestRuns(projectId, { branch: 'develop' });

      const call = prisma.testRun.findMany.mock.calls[0][0];
      expect(call.where.branch).toBe('develop');
    });

    it('should apply environment filter', async () => {
      prisma.testRun.findMany.mockResolvedValue([]);
      prisma.testRun.count.mockResolvedValue(0);

      await service.getTestRuns(projectId, { environment: 'production' });

      const call = prisma.testRun.findMany.mock.calls[0][0];
      expect(call.where.environment).toBe('production');
    });

    it('should apply search filter on name', async () => {
      prisma.testRun.findMany.mockResolvedValue([]);
      prisma.testRun.count.mockResolvedValue(0);

      await service.getTestRuns(projectId, { search: 'nightly' });

      const call = prisma.testRun.findMany.mock.calls[0][0];
      expect(call.where.name).toEqual({ contains: 'nightly', mode: 'insensitive' });
    });

    it('should use externalId as fallback when name is null', async () => {
      const run = makeRun('run-1', { name: null, externalId: '42' });
      prisma.testRun.findMany.mockResolvedValue([run]);
      prisma.testRun.count.mockResolvedValue(1);

      const result = await service.getTestRuns(projectId, {});

      expect(result.items[0].name).toBe('Run 42');
    });

    it('should default nullable fields to safe values', async () => {
      const run = makeRun('run-1', {
        branch: null,
        sha: null,
        environment: null,
        durationMs: null,
        pipelineRunId: null,
      });
      prisma.testRun.findMany.mockResolvedValue([run]);
      prisma.testRun.count.mockResolvedValue(1);

      const result = await service.getTestRuns(projectId, {});
      const item = result.items[0];

      expect(item.branch).toBe('');
      expect(item.sha).toBe('');
      expect(item.environment).toBe('');
      expect(item.durationMs).toBe(0);
      expect(item.pipelineRunId).toBe('');
    });

    it('should return empty items when no test runs match', async () => {
      prisma.testRun.findMany.mockResolvedValue([]);
      prisma.testRun.count.mockResolvedValue(0);

      const result = await service.getTestRuns(projectId, {});

      expect(result.items).toEqual([]);
      expect(result.totalPages).toBe(0);
    });
  });

  // ── getTestRunResults ──────────────────────────────────────

  describe('getTestRunResults()', () => {
    const runId = 'run-uuid-1';

    const makeResult = (id: string, overrides = {}) => ({
      id,
      status: 'PASSED',
      durationMs: 500,
      errorMessage: null,
      testCase: { id: `tc-${id}`, title: `Test case ${id}` },
      ...overrides,
    });

    it('should return paginated test results', async () => {
      const items = [makeResult('r-1'), makeResult('r-2')];
      prisma.testResult.findMany.mockResolvedValue(items);
      prisma.testResult.count.mockResolvedValue(2);

      const result = await service.getTestRunResults(runId, {});

      expect(result.items).toHaveLength(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(50);
      expect(result.total).toBe(2);
    });

    it('should use default pageSize of 50', async () => {
      prisma.testResult.findMany.mockResolvedValue([]);
      prisma.testResult.count.mockResolvedValue(0);

      await service.getTestRunResults(runId, {});

      expect(prisma.testResult.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });

    it('should map result fields correctly', async () => {
      const items = [makeResult('r-1', { status: 'FAILED', durationMs: 1200, errorMessage: 'Assertion failed' })];
      prisma.testResult.findMany.mockResolvedValue(items);
      prisma.testResult.count.mockResolvedValue(1);

      const result = await service.getTestRunResults(runId, {});

      expect(result.items[0]).toEqual({
        id: 'r-1',
        status: 'FAILED',
        durationMs: 1200,
        errorMessage: 'Assertion failed',
        testCaseId: 'tc-r-1',
        testTitle: 'Test case r-1',
      });
    });

    it('should default durationMs to 0 when null', async () => {
      const items = [makeResult('r-1', { durationMs: null })];
      prisma.testResult.findMany.mockResolvedValue(items);
      prisma.testResult.count.mockResolvedValue(1);

      const result = await service.getTestRunResults(runId, {});

      expect(result.items[0].durationMs).toBe(0);
    });

    it('should return empty items when no results exist', async () => {
      prisma.testResult.findMany.mockResolvedValue([]);
      prisma.testResult.count.mockResolvedValue(0);

      const result = await service.getTestRunResults(runId, {});

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  // ── getDefects ────────────────────────────────────────────

  describe('getDefects()', () => {
    const makeDefect = (id: string, overrides = {}) => ({
      id,
      externalId: `ext-${id}`,
      title: `Defect ${id}`,
      severity: 'HIGH',
      priority: 'P1',
      status: 'OPEN',
      component: 'Auth',
      featureAreaId: 'fa-1',
      isEscaped: false,
      reopenCount: 0,
      createdAt: new Date('2026-03-01'),
      resolvedAt: null,
      closedAt: null,
      changelog: [{ event: 'created' }],
      ...overrides,
    });

    it('should return paginated defects', async () => {
      const items = [makeDefect('d-1'), makeDefect('d-2')];
      prisma.defect.findMany.mockResolvedValue(items);
      prisma.defect.count.mockResolvedValue(2);

      const result = await service.getDefects(projectId, {});

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(25);
    });

    it('should apply severity filter', async () => {
      prisma.defect.findMany.mockResolvedValue([]);
      prisma.defect.count.mockResolvedValue(0);

      await service.getDefects(projectId, { severity: 'CRITICAL' });

      const call = prisma.defect.findMany.mock.calls[0][0];
      expect(call.where.severity).toBe('CRITICAL');
    });

    it('should apply status filter', async () => {
      prisma.defect.findMany.mockResolvedValue([]);
      prisma.defect.count.mockResolvedValue(0);

      await service.getDefects(projectId, { status: 'RESOLVED' });

      const call = prisma.defect.findMany.mock.calls[0][0];
      expect(call.where.status).toBe('RESOLVED');
    });

    it('should apply featureAreaId filter', async () => {
      prisma.defect.findMany.mockResolvedValue([]);
      prisma.defect.count.mockResolvedValue(0);

      await service.getDefects(projectId, { featureAreaId: 'fa-2' });

      const call = prisma.defect.findMany.mock.calls[0][0];
      expect(call.where.featureAreaId).toBe('fa-2');
    });

    it('should apply search filter on title, externalId, and component', async () => {
      prisma.defect.findMany.mockResolvedValue([]);
      prisma.defect.count.mockResolvedValue(0);

      await service.getDefects(projectId, { search: 'crash' });

      const call = prisma.defect.findMany.mock.calls[0][0];
      expect(call.where.OR).toEqual([
        { title: { contains: 'crash', mode: 'insensitive' } },
        { externalId: { contains: 'crash', mode: 'insensitive' } },
        { component: { contains: 'crash', mode: 'insensitive' } },
      ]);
    });

    it('should default nullable fields to safe values', async () => {
      const d = makeDefect('d-1', { externalId: null, component: null, featureAreaId: null, changelog: null });
      prisma.defect.findMany.mockResolvedValue([d]);
      prisma.defect.count.mockResolvedValue(1);

      const result = await service.getDefects(projectId, {});
      const item = result.items[0];

      expect(item.externalId).toBe('');
      expect(item.component).toBe('');
      expect(item.featureAreaId).toBe('');
      expect(item.changelog).toEqual([]);
    });

    it('should return empty items when no defects match', async () => {
      prisma.defect.findMany.mockResolvedValue([]);
      prisma.defect.count.mockResolvedValue(0);

      const result = await service.getDefects(projectId, {});

      expect(result.items).toEqual([]);
      expect(result.totalPages).toBe(0);
    });
  });

  // ── getStories ────────────────────────────────────────────

  describe('getStories()', () => {
    const makeStory = (id: string, overrides = {}) => ({
      id,
      externalId: `PS-${id}`,
      title: `Story ${id}`,
      url: `https://jira.example.com/PS-${id}`,
      status: 'OPEN',
      storyPoints: 3,
      assignee: 'developer@example.com',
      component: 'Auth',
      labels: ['sprint-1'],
      createdAt: new Date('2026-03-01'),
      resolvedAt: null,
      ...overrides,
    });

    it('should return paginated stories', async () => {
      const items = [makeStory('1'), makeStory('2')];
      prisma.story.findMany.mockResolvedValue(items);
      prisma.story.count.mockResolvedValue(2);

      const result = await service.getStories(projectId, {});

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(25);
    });

    it('should apply status filter', async () => {
      prisma.story.findMany.mockResolvedValue([]);
      prisma.story.count.mockResolvedValue(0);

      await service.getStories(projectId, { status: 'IN_PROGRESS' });

      const call = prisma.story.findMany.mock.calls[0][0];
      expect(call.where.status).toBe('IN_PROGRESS');
    });

    it('should apply component filter', async () => {
      prisma.story.findMany.mockResolvedValue([]);
      prisma.story.count.mockResolvedValue(0);

      await service.getStories(projectId, { component: 'Billing' });

      const call = prisma.story.findMany.mock.calls[0][0];
      expect(call.where.component).toBe('Billing');
    });

    it('should apply search filter on title', async () => {
      prisma.story.findMany.mockResolvedValue([]);
      prisma.story.count.mockResolvedValue(0);

      await service.getStories(projectId, { search: 'payment' });

      const call = prisma.story.findMany.mock.calls[0][0];
      expect(call.where.title).toEqual({ contains: 'payment', mode: 'insensitive' });
    });

    it('should default externalId to empty string when null', async () => {
      const s = makeStory('1', { externalId: null });
      prisma.story.findMany.mockResolvedValue([s]);
      prisma.story.count.mockResolvedValue(1);

      const result = await service.getStories(projectId, {});

      expect(result.items[0].externalId).toBe('');
    });

    it('should return empty items when no stories match', async () => {
      prisma.story.findMany.mockResolvedValue([]);
      prisma.story.count.mockResolvedValue(0);

      const result = await service.getStories(projectId, {});

      expect(result.items).toEqual([]);
      expect(result.totalPages).toBe(0);
    });
  });

  // ── getPipelineRuns ────────────────────────────────────────

  describe('getPipelineRuns()', () => {
    const makePipelineRun = (id: string, overrides = {}) => ({
      id,
      workflowName: 'CI Pipeline',
      branch: 'main',
      sha: 'abc123',
      status: 'SUCCESS',
      durationMs: 300000,
      triggeredBy: 'dev@example.com',
      startedAt: new Date('2026-03-01'),
      ...overrides,
    });

    it('should return last 50 pipeline runs', async () => {
      const runs = [makePipelineRun('p-1'), makePipelineRun('p-2')];
      prisma.pipelineRun.findMany.mockResolvedValue(runs);

      const result = await service.getPipelineRuns(projectId);

      expect(result).toHaveLength(2);
      expect(prisma.pipelineRun.findMany).toHaveBeenCalledWith({
        where: { projectId },
        orderBy: { startedAt: 'desc' },
        take: 50,
      });
    });

    it('should normalize non-SUCCESS status to FAILURE', async () => {
      const runs = [
        makePipelineRun('p-1', { status: 'CANCELLED' }),
        makePipelineRun('p-2', { status: 'IN_PROGRESS' }),
      ];
      prisma.pipelineRun.findMany.mockResolvedValue(runs);

      const result = await service.getPipelineRuns(projectId);

      expect(result[0].status).toBe('FAILURE');
      expect(result[1].status).toBe('FAILURE');
    });

    it('should keep SUCCESS status as-is', async () => {
      prisma.pipelineRun.findMany.mockResolvedValue([makePipelineRun('p-1', { status: 'SUCCESS' })]);

      const result = await service.getPipelineRuns(projectId);

      expect(result[0].status).toBe('SUCCESS');
    });

    it('should default nullable fields to safe values', async () => {
      const run = makePipelineRun('p-1', { branch: null, sha: null, durationMs: null, triggeredBy: null });
      prisma.pipelineRun.findMany.mockResolvedValue([run]);

      const result = await service.getPipelineRuns(projectId);

      expect(result[0].branch).toBe('');
      expect(result[0].sha).toBe('');
      expect(result[0].durationMs).toBe(0);
      expect(result[0].triggeredBy).toBe('');
    });

    it('should return empty array when no pipeline runs exist', async () => {
      prisma.pipelineRun.findMany.mockResolvedValue([]);

      const result = await service.getPipelineRuns(projectId);

      expect(result).toEqual([]);
    });
  });

  // ── getTestCaseHistory ────────────────────────────────────

  describe('getTestCaseHistory()', () => {
    const testCaseId = 'tc-uuid-1';

    const makeHistoryResult = (runId: string, startedAt: Date, overrides = {}) => ({
      runId,
      status: 'PASSED',
      durationMs: 500,
      errorMessage: null,
      run: {
        name: `Run ${runId}`,
        branch: 'main',
        environment: 'staging',
        startedAt,
      },
      ...overrides,
    });

    it('should return deduplicated history sorted by date descending', async () => {
      const d1 = new Date('2026-03-01');
      const d2 = new Date('2026-03-02');
      const results = [
        makeHistoryResult('run-2', d2),
        makeHistoryResult('run-1', d1),
      ];
      prisma.testResult.findMany.mockResolvedValue(results);

      const result = await service.getTestCaseHistory(projectId, testCaseId);

      expect(result).toHaveLength(2);
      expect(result[0].runId).toBe('run-2');
      expect(result[1].runId).toBe('run-1');
    });

    it('should deduplicate multiple results for the same run', async () => {
      const d1 = new Date('2026-03-01');
      const results = [
        makeHistoryResult('run-1', d1, { status: 'FAILED' }),
        makeHistoryResult('run-1', d1, { status: 'PASSED' }),
      ];
      prisma.testResult.findMany.mockResolvedValue(results);

      const result = await service.getTestCaseHistory(projectId, testCaseId);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('FAILED'); // first encountered wins
    });

    it('should limit to 50 entries', async () => {
      const results = Array.from({ length: 60 }, (_, i) =>
        makeHistoryResult(`run-${i}`, new Date(Date.now() - i * 86400000)),
      );
      prisma.testResult.findMany.mockResolvedValue(results);

      const result = await service.getTestCaseHistory(projectId, testCaseId);

      expect(result).toHaveLength(50);
    });

    it('should default nullable fields to safe values', async () => {
      const d1 = new Date('2026-03-01');
      const results = [makeHistoryResult('run-1', d1, {
        durationMs: null,
        errorMessage: null,
        run: { name: null, branch: null, environment: null, startedAt: d1 },
      })];
      prisma.testResult.findMany.mockResolvedValue(results);

      const result = await service.getTestCaseHistory(projectId, testCaseId);

      expect(result[0].runName).toBe('');
      expect(result[0].durationMs).toBe(0);
      expect(result[0].errorMessage).toBeUndefined();
      expect(result[0].branch).toBe('');
      expect(result[0].environment).toBe('');
    });

    it('should return empty array when no history exists', async () => {
      prisma.testResult.findMany.mockResolvedValue([]);

      const result = await service.getTestCaseHistory(projectId, testCaseId);

      expect(result).toEqual([]);
    });
  });

  // ── getPassRateTrend ──────────────────────────────────────

  describe('getPassRateTrend()', () => {
    it('should aggregate runs by day and compute pass rate', async () => {
      const runs = [
        { startedAt: new Date('2026-03-01T10:00:00Z'), status: 'PASSED', totalTests: 100, passedCount: 90 },
        { startedAt: new Date('2026-03-01T14:00:00Z'), status: 'FAILED', totalTests: 100, passedCount: 80 },
        { startedAt: new Date('2026-03-02T10:00:00Z'), status: 'PASSED', totalTests: 50, passedCount: 50 },
      ];
      prisma.testRun.findMany.mockResolvedValue(runs);

      const result = await service.getPassRateTrend(projectId, 30);

      expect(result).toHaveLength(2);

      const day1 = result.find((r) => r.date === '2026-03-01');
      expect(day1).toBeDefined();
      expect(day1!.totalTests).toBe(200);
      expect(day1!.passRate).toBe(85); // 170/200 * 100
      expect(day1!.totalRuns).toBe(2);
      expect(day1!.passedRuns).toBe(1);
      expect(day1!.failedRuns).toBe(1);

      const day2 = result.find((r) => r.date === '2026-03-02');
      expect(day2!.passRate).toBe(100);
      expect(day2!.totalRuns).toBe(1);
    });

    it('should return empty array when no runs exist', async () => {
      prisma.testRun.findMany.mockResolvedValue([]);

      const result = await service.getPassRateTrend(projectId, 30);

      expect(result).toEqual([]);
    });

    it('should cap days at 365', async () => {
      prisma.testRun.findMany.mockResolvedValue([]);

      await service.getPassRateTrend(projectId, 1000);

      const call = prisma.testRun.findMany.mock.calls[0][0];
      const since = call.where.startedAt.gte as Date;
      const diffDays = Math.round((Date.now() - since.getTime()) / 86400000);
      expect(diffDays).toBeLessThanOrEqual(366);
      expect(diffDays).toBeGreaterThanOrEqual(364);
    });

    it('should return 0 passRate when totalTests is 0', async () => {
      const runs = [
        { startedAt: new Date('2026-03-01T10:00:00Z'), status: 'PASSED', totalTests: 0, passedCount: 0 },
      ];
      prisma.testRun.findMany.mockResolvedValue(runs);

      const result = await service.getPassRateTrend(projectId, 30);

      expect(result[0].passRate).toBe(0);
    });

    it('should handle multiple days correctly', async () => {
      const runs = Array.from({ length: 5 }, (_, i) => ({
        startedAt: new Date(`2026-03-0${i + 1}T10:00:00Z`),
        status: 'PASSED',
        totalTests: 10,
        passedCount: 10 - i,
      }));
      prisma.testRun.findMany.mockResolvedValue(runs);

      const result = await service.getPassRateTrend(projectId, 30);

      expect(result).toHaveLength(5);
    });

    it('counts ERRORED and CANCELLED runs in failedRuns', async () => {
      const runs = [
        { startedAt: new Date('2026-03-01T10:00:00Z'), status: 'PASSED', totalTests: 10, passedCount: 10 },
        { startedAt: new Date('2026-03-01T11:00:00Z'), status: 'CANCELLED', totalTests: 0, passedCount: 0 },
        { startedAt: new Date('2026-03-01T12:00:00Z'), status: 'ERRORED', totalTests: 0, passedCount: 0 },
        { startedAt: new Date('2026-03-01T13:00:00Z'), status: 'FAILED', totalTests: 10, passedCount: 5 },
      ];
      prisma.testRun.findMany.mockResolvedValue(runs);

      const result = await service.getPassRateTrend(projectId, 30);
      const day = result.find((r) => r.date === '2026-03-01');
      expect(day).toBeDefined();
      expect(day!.totalRuns).toBe(4);
      expect(day!.passedRuns).toBe(1);
      expect(day!.failedRuns).toBe(3);
    });
  });

  // ── getCoverageData ────────────────────────────────────────

  describe('getCoverageData()', () => {
    it('should return coverage grouped by feature areas when available', async () => {
      const areas = [
        {
          id: 'fa-1',
          name: 'Auth',
          testCases: [
            { id: 'tc-1', automationStatus: 'AUTOMATED' },
            { id: 'tc-2', automationStatus: 'AUTOMATED' },
            { id: 'tc-3', automationStatus: 'NOT_AUTOMATED' },
          ],
        },
        {
          id: 'fa-2',
          name: 'Billing',
          testCases: [
            { id: 'tc-4', automationStatus: 'NEEDS_UPDATE' },
          ],
        },
      ];
      prisma.featureArea.findMany.mockResolvedValue(areas);

      const result = await service.getCoverageData(projectId);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        featureAreaId: 'fa-1',
        featureAreaName: 'Auth',
        totalTestCases: 3,
        automatedCount: 2,
        manualCount: 1,
        needsUpdateCount: 0,
        automationPct: 66.7,
      });
      expect(result[1]).toEqual({
        featureAreaId: 'fa-2',
        featureAreaName: 'Billing',
        totalTestCases: 1,
        automatedCount: 0,
        manualCount: 0,
        needsUpdateCount: 1,
        automationPct: 0,
      });
    });

    it('should fall back to suiteName grouping when no feature areas exist', async () => {
      prisma.featureArea.findMany.mockResolvedValue([]);
      prisma.testCase.findMany.mockResolvedValue([
        { suiteName: 'Login', automationStatus: 'AUTOMATED' },
        { suiteName: 'Login', automationStatus: 'NOT_AUTOMATED' },
        { suiteName: 'Checkout', automationStatus: 'AUTOMATED' },
      ]);

      const result = await service.getCoverageData(projectId);

      expect(result).toHaveLength(2);
      // Sorted by count descending: Login (2) then Checkout (1)
      expect(result[0].featureAreaName).toBe('Login');
      expect(result[0].totalTestCases).toBe(2);
      expect(result[1].featureAreaName).toBe('Checkout');
    });

    it('should return empty array when no feature areas and no suites', async () => {
      prisma.featureArea.findMany.mockResolvedValue([]);
      prisma.testCase.findMany.mockResolvedValue([]);

      const result = await service.getCoverageData(projectId);

      expect(result).toEqual([]);
    });

    it('should compute automationPct rounded to one decimal', async () => {
      const areas = [{
        id: 'fa-1',
        name: 'Search',
        testCases: [
          { id: 'tc-1', automationStatus: 'AUTOMATED' },
          { id: 'tc-2', automationStatus: 'AUTOMATED' },
          { id: 'tc-3', automationStatus: 'NOT_AUTOMATED' },
        ],
      }];
      prisma.featureArea.findMany.mockResolvedValue(areas);

      const result = await service.getCoverageData(projectId);

      expect(result[0].automationPct).toBe(66.7);
    });

    it('should return 0 automationPct when there are no test cases in an area', async () => {
      const areas = [{
        id: 'fa-1',
        name: 'Empty Area',
        testCases: [],
      }];
      prisma.featureArea.findMany.mockResolvedValue(areas);

      const result = await service.getCoverageData(projectId);

      expect(result[0].automationPct).toBe(0);
      expect(result[0].totalTestCases).toBe(0);
    });
  });

  // ── getEpicCoverage ────────────────────────────────────────

  describe('getEpicCoverage()', () => {
    it('should return epic coverage with story-level TC matching', async () => {
      prisma.epic.findMany.mockResolvedValue([
        {
          id: 'epic-1',
          externalId: 'EP-1',
          title: 'Auth Epic',
          url: 'https://jira.example.com/EP-1',
          status: 'IN_PROGRESS',
          stories: [
            { externalId: 'PS-100', title: 'Login', url: 'https://jira.example.com/PS-100', status: 'CLOSED', storyPoints: 5 },
            { externalId: 'PS-101', title: 'Signup', url: 'https://jira.example.com/PS-101', status: 'OPEN', storyPoints: 3 },
          ],
        },
      ]);
      prisma.testCase.findMany.mockResolvedValue([
        { id: 'tc-1', externalId: 'C100', title: 'Login test', references: 'PS-100', automationStatus: 'AUTOMATED' },
        { id: 'tc-2', externalId: 'C101', title: 'Login edge case', references: 'PS-100, PS-101', automationStatus: 'NOT_AUTOMATED' },
      ]);

      const result = await service.getEpicCoverage(projectId);

      expect(result).toHaveLength(1);
      const epic = result[0];
      expect(epic.epicId).toBe('epic-1');
      expect(epic.totalStories).toBe(2);
      expect(epic.closedStories).toBe(1);
      expect(epic.totalPoints).toBe(8);
      expect(epic.storiesWithTCs).toBe(2); // both PS-100 and PS-101 have TCs
      expect(epic.totalTCs).toBe(3); // PS-100 gets 2 TCs, PS-101 gets 1 TC
      expect(epic.automatedTCs).toBe(1);
    });

    it('should return empty array when no epics exist', async () => {
      prisma.epic.findMany.mockResolvedValue([]);
      prisma.testCase.findMany.mockResolvedValue([]);

      const result = await service.getEpicCoverage(projectId);

      expect(result).toEqual([]);
    });

    it('should handle epics with no stories', async () => {
      prisma.epic.findMany.mockResolvedValue([
        {
          id: 'epic-1',
          externalId: 'EP-1',
          title: 'Empty Epic',
          url: null,
          status: 'OPEN',
          stories: [],
        },
      ]);
      prisma.testCase.findMany.mockResolvedValue([]);

      const result = await service.getEpicCoverage(projectId);

      expect(result[0].totalStories).toBe(0);
      expect(result[0].storiesCoveragePct).toBe(0);
      expect(result[0].automationPct).toBe(0);
    });

    it('should compute storiesCoveragePct correctly', async () => {
      prisma.epic.findMany.mockResolvedValue([
        {
          id: 'epic-1',
          externalId: 'EP-1',
          title: 'Mixed Epic',
          url: null,
          status: 'OPEN',
          stories: [
            { externalId: 'PS-200', title: 'Covered', url: null, status: 'OPEN', storyPoints: 2 },
            { externalId: 'PS-201', title: 'Uncovered', url: null, status: 'OPEN', storyPoints: 2 },
            { externalId: 'PS-202', title: 'Also uncovered', url: null, status: 'OPEN', storyPoints: 2 },
          ],
        },
      ]);
      prisma.testCase.findMany.mockResolvedValue([
        { id: 'tc-1', externalId: 'C1', title: 'Test', references: 'PS-200', automationStatus: 'AUTOMATED' },
      ]);

      const result = await service.getEpicCoverage(projectId);

      expect(result[0].storiesCoveragePct).toBe(33.3);
    });

    it('should handle stories with no matching test cases', async () => {
      prisma.epic.findMany.mockResolvedValue([
        {
          id: 'epic-1',
          externalId: 'EP-1',
          title: 'No TC Epic',
          url: null,
          status: 'OPEN',
          stories: [
            { externalId: 'PS-300', title: 'Lonely Story', url: null, status: 'OPEN', storyPoints: 1 },
          ],
        },
      ]);
      prisma.testCase.findMany.mockResolvedValue([]);

      const result = await service.getEpicCoverage(projectId);

      const story = result[0].stories[0];
      expect(story.totalTCs).toBe(0);
      expect(story.automatedTCs).toBe(0);
      expect(story.testCases).toEqual([]);
    });

    it('should count closed and resolved stories', async () => {
      prisma.epic.findMany.mockResolvedValue([
        {
          id: 'epic-1',
          externalId: 'EP-1',
          title: 'Mixed Status',
          url: null,
          status: 'OPEN',
          stories: [
            { externalId: 'PS-1', title: 'S1', url: null, status: 'CLOSED', storyPoints: 1 },
            { externalId: 'PS-2', title: 'S2', url: null, status: 'RESOLVED', storyPoints: 1 },
            { externalId: 'PS-3', title: 'S3', url: null, status: 'OPEN', storyPoints: 1 },
          ],
        },
      ]);
      prisma.testCase.findMany.mockResolvedValue([]);

      const result = await service.getEpicCoverage(projectId);

      expect(result[0].closedStories).toBe(2);
    });
  });

  // ── getDefectTrend ────────────────────────────────────────

  describe('getDefectTrend()', () => {
    it('should return daily entries with date, opened, and closed', async () => {
      const defects = [
        { createdAt: new Date('2026-02-02'), resolvedAt: new Date('2026-02-05') },
        { createdAt: new Date('2026-02-03'), resolvedAt: null },
        { createdAt: new Date('2026-02-09'), resolvedAt: new Date('2026-02-10') },
      ];
      prisma.defect.findMany.mockResolvedValue(defects);

      const result = await service.getDefectTrend(projectId);

      expect(result.length).toBeGreaterThan(0);
      for (const entry of result) {
        expect(entry).toHaveProperty('date');
        expect(entry).toHaveProperty('opened');
        expect(entry).toHaveProperty('closed');
      }
    });

    it('should fill missing days with zeros when no defects exist', async () => {
      prisma.defect.findMany.mockResolvedValue([]);

      const result = await service.getDefectTrend(projectId);

      expect(result.length).toBeGreaterThan(80);
      for (const entry of result) {
        expect(entry.opened).toBe(0);
        expect(entry.closed).toBe(0);
      }
    });

    it('should sort results by date ascending', async () => {
      const defects = [
        { createdAt: new Date('2026-03-01'), resolvedAt: null },
        { createdAt: new Date('2026-02-01'), resolvedAt: null },
        { createdAt: new Date('2026-02-15'), resolvedAt: null },
      ];
      prisma.defect.findMany.mockResolvedValue(defects);

      const result = await service.getDefectTrend(projectId);

      for (let i = 1; i < result.length; i++) {
        expect(result[i].date >= result[i - 1].date).toBe(true);
      }
    });

    it('should count resolved defects on the day they were resolved', async () => {
      const createdAt = new Date('2026-01-15');
      const resolvedAt = new Date('2026-03-01');
      const defects = [{ createdAt, resolvedAt }];
      prisma.defect.findMany.mockResolvedValue(defects);

      const result = await service.getDefectTrend(projectId);

      const resDay = result.find((r) => r.date === '2026-03-01');
      expect(resDay).toBeDefined();
      expect(resDay!.closed).toBe(1);
    });

    it('should count defect in both opened and resolved days when they differ', async () => {
      const defects = [
        { createdAt: new Date('2026-02-10'), resolvedAt: new Date('2026-02-24') },
      ];
      prisma.defect.findMany.mockResolvedValue(defects);

      const result = await service.getDefectTrend(projectId);

      const openedDay = result.find((r) => r.date === '2026-02-10');
      const closedDay = result.find((r) => r.date === '2026-02-24');
      expect(openedDay).toBeDefined();
      expect(openedDay!.opened).toBe(1);
      expect(closedDay).toBeDefined();
      expect(closedDay!.closed).toBe(1);
    });
  });

  // ── getFlakyTests ─────────────────────────────────────────

  describe('getFlakyTests()', () => {
    // Helper: mock run selection (single findMany call — uses all synced runs)
    const mockRuns = (runs: { id: string; startedAt: Date }[]) => {
      prisma.testRun.findMany.mockResolvedValueOnce(runs);
    };

    it('should detect flaky test that failed then recovered (P-F-P = 2 transitions)', async () => {
      const dates = Array.from({ length: 5 }, (_, i) => new Date(2026, 2, i + 1));
      mockRuns(dates.map((d, i) => ({ id: `run-${i + 1}`, startedAt: d })));

      prisma.testCase.findMany.mockResolvedValue([
        {
          id: 'tc-1',
          title: 'Flaky Login Test',
          suiteName: 'Auth',
          featureAreaId: 'fa-1',
          testResults: [
            { status: 'PASSED', runId: 'run-1' },
            { status: 'FAILED', runId: 'run-2' },
            { status: 'PASSED', runId: 'run-3' },
          ],
        },
      ]);

      const result = await service.getFlakyTests(projectId);

      expect(result).toHaveLength(1);
      expect(result[0].testCaseId).toBe('tc-1');
      expect(result[0].flakyCount).toBe(2);
      expect(result[0].totalExecutions).toBe(3);
    });

    it('should return empty array when no recent runs exist', async () => {
      prisma.testRun.findMany.mockResolvedValueOnce([]);

      const result = await service.getFlakyTests(projectId);

      expect(result).toEqual([]);
    });

    it('should exclude tests with only 1 result', async () => {
      mockRuns([{ id: 'run-1', startedAt: new Date('2026-03-01') }]);

      prisma.testCase.findMany.mockResolvedValue([
        {
          id: 'tc-1',
          title: 'Too few',
          suiteName: 'Auth',
          featureAreaId: null,
          testResults: [{ status: 'FAILED', runId: 'run-1' }],
        },
      ]);

      const result = await service.getFlakyTests(projectId);

      expect(result).toEqual([]);
    });

    it('should NOT flag a test with only 1 transition (pure regression)', async () => {
      const dates = Array.from({ length: 5 }, (_, i) => new Date(`2026-03-0${i + 1}`));
      mockRuns(dates.map((d, i) => ({ id: `run-${i}`, startedAt: d })));

      prisma.testCase.findMany.mockResolvedValue([
        {
          id: 'tc-1',
          title: 'Regression',
          suiteName: 'Auth',
          featureAreaId: null,
          testResults: [
            { status: 'PASSED', runId: 'run-0' },
            { status: 'PASSED', runId: 'run-1' },
            { status: 'PASSED', runId: 'run-2' },
            { status: 'FAILED', runId: 'run-3' },
            { status: 'FAILED', runId: 'run-4' },
          ],
        },
      ]);

      const result = await service.getFlakyTests(projectId);

      // Only 1 transition (PASSED->FAILED) — regression, not flaky
      expect(result).toEqual([]);
    });

    it('should sort results by lastFlakyAt descending (most recently flaky first)', async () => {
      const dates = Array.from({ length: 8 }, (_, i) => new Date(Date.now() - i * 86400000));
      mockRuns(dates.map((d, i) => ({ id: `run-${i}`, startedAt: d })));

      prisma.testCase.findMany.mockResolvedValue([
        {
          id: 'tc-old',
          title: 'Flaky long ago',
          suiteName: 'S1',
          featureAreaId: null,
          testResults: [
            { status: 'PASSED', runId: 'run-0' },
            { status: 'PASSED', runId: 'run-1' },
            { status: 'PASSED', runId: 'run-2' },
            { status: 'PASSED', runId: 'run-3' },
            { status: 'FAILED', runId: 'run-4' },
            { status: 'PASSED', runId: 'run-5' },
            { status: 'FAILED', runId: 'run-6' },
          ],
        },
        {
          id: 'tc-recent',
          title: 'Flaky right now',
          suiteName: 'S2',
          featureAreaId: null,
          testResults: [
            { status: 'PASSED', runId: 'run-0' },
            { status: 'FAILED', runId: 'run-1' },
            { status: 'PASSED', runId: 'run-2' },
            { status: 'FAILED', runId: 'run-3' },
            { status: 'PASSED', runId: 'run-4' },
          ],
        },
      ]);

      const result = await service.getFlakyTests(projectId);

      expect(result).toHaveLength(2);
      expect(result[0].testCaseId).toBe('tc-recent');
      expect(result[1].testCaseId).toBe('tc-old');
    });

    it('should use runs from all sources within 90-day window', async () => {
      const allRuns = [
        ...Array.from({ length: 7 }, (_, i) => ({
          id: `gh-${i}`,
          startedAt: new Date(2026, 2, 5, i),
        })),
        ...Array.from({ length: 3 }, (_, i) => ({
          id: `tr-${i}`,
          startedAt: new Date(2026, 2, 1, i),
        })),
      ];
      prisma.testRun.findMany.mockResolvedValueOnce(allRuns);

      prisma.testCase.findMany.mockResolvedValue([]);

      await service.getFlakyTests(projectId);

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

    it('should flag a test with a single FLAKY result (within-run retry disagreement)', async () => {
      // The GitHub connector now emits status='FLAKY' when retries inside a
      // single run disagree.  A single such run is enough to mark the test
      // flaky — we should not require additional cross-run transitions.
      const dates = Array.from({ length: 3 }, (_, i) => new Date(2026, 2, i + 1));
      mockRuns(dates.map((d, i) => ({ id: `run-${i + 1}`, startedAt: d })));

      prisma.testCase.findMany.mockResolvedValue([
        {
          id: 'tc-flaky',
          title: 'Login retried successfully',
          suiteName: 'Auth',
          featureAreaId: 'fa-1',
          testResults: [
            { status: 'PASSED', runId: 'run-1' },
            { status: 'FLAKY', runId: 'run-2' },
            { status: 'PASSED', runId: 'run-3' },
          ],
        },
      ]);

      const result = await service.getFlakyTests(projectId);

      expect(result).toHaveLength(1);
      expect(result[0].testCaseId).toBe('tc-flaky');
      expect(result[0].totalExecutions).toBe(3);
      // Single FLAKY hit, no PASS↔FAIL transitions: flakyCount must be 1
      // (the previous algorithm double-counted FLAKY as both a transition
      // and a direct hit, which inflated this to 3).
      expect(result[0].flakyCount).toBe(1);
      // Rate denominator is totalExecutions - 1 = 2, numerator is 1 → 50%
      expect(result[0].flakyRate).toBe(50);
    });

    it('uses the newest of FLAKY-row vs transition timestamps for lastFlakyAt', async () => {
      // When a test has both an older FLAKY row and a newer PASS↔FAIL
      // transition, lastFlakyAt must reflect the newer signal so the Flaky
      // Tests list (sorted lastFlakyAt desc) does not hide the test behind
      // genuinely older entries. Picking the FLAKY row unconditionally
      // backdates the entry, which is what Codex flagged.
      const oldFlakyDate = new Date(2026, 0, 1, 10, 0, 0);
      const middlePass = new Date(2026, 1, 1, 10, 0, 0);
      const recentFail = new Date(2026, 2, 1, 10, 0, 0);
      const recentPass = new Date(2026, 2, 2, 10, 0, 0);

      mockRuns([
        { id: 'run-recentPass', startedAt: recentPass },
        { id: 'run-recentFail', startedAt: recentFail },
        { id: 'run-middlePass', startedAt: middlePass },
        { id: 'run-oldFlaky', startedAt: oldFlakyDate },
      ]);

      prisma.testCase.findMany.mockResolvedValue([
        {
          id: 'tc-mixed',
          title: 'Login mixed signals',
          suiteName: 'Auth',
          featureAreaId: 'fa-1',
          testResults: [
            { status: 'FLAKY', runId: 'run-oldFlaky' },
            { status: 'PASSED', runId: 'run-middlePass' },
            { status: 'FAILED', runId: 'run-recentFail' },
            { status: 'PASSED', runId: 'run-recentPass' },
          ],
        },
      ]);

      const result = await service.getFlakyTests(projectId);

      expect(result).toHaveLength(1);
      // The most recent transition (PASSED on recentPass following FAILED on
      // recentFail) is newer than the OLD FLAKY row — lastFlakyAt should
      // surface that newer transition timestamp, not the older FLAKY one.
      expect(result[0].lastFlakyAt.getTime()).toBe(recentPass.getTime());
    });

    it('should default featureAreaId to empty string when null', async () => {
      const dates = Array.from({ length: 5 }, (_, i) => new Date(Date.now() - i * 86400000));
      mockRuns(dates.map((d, i) => ({ id: `run-${i}`, startedAt: d })));

      prisma.testCase.findMany.mockResolvedValue([
        {
          id: 'tc-1',
          title: 'Flaky',
          suiteName: 'S1',
          featureAreaId: null,
          testResults: [
            { status: 'PASSED', runId: 'run-0' },
            { status: 'FAILED', runId: 'run-1' },
            { status: 'PASSED', runId: 'run-2' },
          ],
        },
      ]);

      const result = await service.getFlakyTests(projectId);

      expect(result).toHaveLength(1);
      expect(result[0].featureAreaId).toBe('');
    });
  });

  // ── getSeverityBreakdown ──────────────────────────────────

  describe('getSeverityBreakdown()', () => {
    it('should return severity counts from groupBy', async () => {
      prisma.defect.groupBy.mockResolvedValue([
        { severity: 'CRITICAL', _count: 5 },
        { severity: 'HIGH', _count: 12 },
        { severity: 'MEDIUM', _count: 20 },
        { severity: 'LOW', _count: 8 },
      ]);

      const result = await service.getSeverityBreakdown(projectId);

      expect(result).toEqual([
        { severity: 'CRITICAL', count: 5 },
        { severity: 'HIGH', count: 12 },
        { severity: 'MEDIUM', count: 20 },
        { severity: 'LOW', count: 8 },
      ]);
    });

    it('should call groupBy with correct arguments', async () => {
      prisma.defect.groupBy.mockResolvedValue([]);

      await service.getSeverityBreakdown(projectId);

      expect(prisma.defect.groupBy).toHaveBeenCalledWith({
        by: ['severity'],
        where: { projectId },
        _count: true,
      });
    });

    it('should return empty array when no defects exist', async () => {
      prisma.defect.groupBy.mockResolvedValue([]);

      const result = await service.getSeverityBreakdown(projectId);

      expect(result).toEqual([]);
    });

    it('should handle a single severity', async () => {
      prisma.defect.groupBy.mockResolvedValue([
        { severity: 'HIGH', _count: 3 },
      ]);

      const result = await service.getSeverityBreakdown(projectId);

      expect(result).toEqual([{ severity: 'HIGH', count: 3 }]);
    });
  });

  // ── getRerunStats ─────────────────────────────────────────

  describe('getRerunStats()', () => {
    it('should compute rerun statistics correctly', async () => {
      const runs = [
        { startedAt: new Date('2026-03-01T10:00:00Z'), status: 'FAILED', isRerun: false },
        { startedAt: new Date('2026-03-01T12:00:00Z'), status: 'PASSED', isRerun: true },
        { startedAt: new Date('2026-03-02T10:00:00Z'), status: 'PASSED', isRerun: false },
        { startedAt: new Date('2026-03-02T11:00:00Z'), status: 'PASSED', isRerun: true },
      ];
      prisma.testRun.findMany.mockResolvedValue(runs);

      const result = await service.getRerunStats(projectId);

      expect(result.totalRuns).toBe(4);
      expect(result.rerunCount).toBe(2);
      expect(result.rerunRate).toBe(50);
      // Original runs: 2, 1 failed
      expect(result.originalFailRate).toBe(50);
      expect(result.maskedFailRate).toBe(0);
    });

    it('should return zeroes when no runs exist', async () => {
      prisma.testRun.findMany.mockResolvedValue([]);

      const result = await service.getRerunStats(projectId);

      expect(result.totalRuns).toBe(0);
      expect(result.rerunCount).toBe(0);
      expect(result.rerunRate).toBe(0);
      expect(result.originalFailRate).toBe(0);
    });

    it('should build daily breakdown sorted ascending', async () => {
      const runs = [
        { startedAt: new Date('2026-03-02T10:00:00Z'), status: 'PASSED', isRerun: false },
        { startedAt: new Date('2026-03-01T10:00:00Z'), status: 'FAILED', isRerun: true },
      ];
      prisma.testRun.findMany.mockResolvedValue(runs);

      const result = await service.getRerunStats(projectId);

      expect(result.rerunsByDay).toHaveLength(2);
      expect(result.rerunsByDay[0].date < result.rerunsByDay[1].date).toBe(true);
    });

    it('should track original vs rerun counts per day', async () => {
      const runs = [
        { startedAt: new Date('2026-03-01T10:00:00Z'), status: 'FAILED', isRerun: false },
        { startedAt: new Date('2026-03-01T11:00:00Z'), status: 'PASSED', isRerun: true },
        { startedAt: new Date('2026-03-01T12:00:00Z'), status: 'PASSED', isRerun: false },
      ];
      prisma.testRun.findMany.mockResolvedValue(runs);

      const result = await service.getRerunStats(projectId);

      const day = result.rerunsByDay.find((d) => d.date === '2026-03-01');
      expect(day).toBeDefined();
      expect(day!.original).toBe(2);
      expect(day!.reruns).toBe(1);
      expect(day!.passed).toBe(2);
      expect(day!.failed).toBe(1);
    });

    it('should compute rerunRate rounded to one decimal place', async () => {
      const runs = [
        { startedAt: new Date('2026-03-01T10:00:00Z'), status: 'PASSED', isRerun: false },
        { startedAt: new Date('2026-03-01T11:00:00Z'), status: 'PASSED', isRerun: false },
        { startedAt: new Date('2026-03-01T12:00:00Z'), status: 'PASSED', isRerun: true },
      ];
      prisma.testRun.findMany.mockResolvedValue(runs);

      const result = await service.getRerunStats(projectId);

      expect(result.rerunRate).toBe(33.3);
    });

    it('counts ERRORED and CANCELLED runs as unsuccessful', async () => {
      // The GitHub connector now produces CANCELLED (cancelled workflow) and
      // ERRORED (timed_out / startup_failure) statuses. Run Health and the
      // Daily Run Results chart treat them as failed alongside FAILED;
      // otherwise they inflate totalRuns without contributing to
      // failedCount, masking real CI breakage as a "passed" run.
      const runs = [
        { startedAt: new Date('2026-03-01T10:00:00Z'), status: 'PASSED', isRerun: false },
        { startedAt: new Date('2026-03-01T11:00:00Z'), status: 'CANCELLED', isRerun: false },
        { startedAt: new Date('2026-03-01T12:00:00Z'), status: 'ERRORED', isRerun: false },
        { startedAt: new Date('2026-03-01T13:00:00Z'), status: 'FAILED', isRerun: false },
      ];
      prisma.testRun.findMany.mockResolvedValue(runs);

      const result = await service.getRerunStats(projectId);

      // 4 original runs, 3 unsuccessful → 75%
      expect(result.totalRuns).toBe(4);
      expect(result.originalFailRate).toBe(75);

      const day = result.rerunsByDay.find((d) => d.date === '2026-03-01');
      expect(day).toBeDefined();
      expect(day!.passed).toBe(1);
      expect(day!.failed).toBe(3);
    });
  });

  // ── getDefectTimingStats ───────────────────────────────────

  describe('getDefectTimingStats()', () => {
    // Helper: getDefectTimingStats calls findMany twice (resolved defects, then all defects for burndown)
    function mockDefectQueries(resolved: any[], all?: any[]) {
      prisma.defect.findMany
        .mockResolvedValueOnce(resolved)
        .mockResolvedValueOnce(all ?? resolved);
    }

    it('should compute avg and median MTTR in hours', async () => {
      const defects = [
        { createdAt: new Date('2026-03-01T00:00:00Z'), resolvedAt: new Date('2026-03-01T12:00:00Z'), severity: 'HIGH' },
        { createdAt: new Date('2026-03-01T00:00:00Z'), resolvedAt: new Date('2026-03-02T00:00:00Z'), severity: 'HIGH' },
        { createdAt: new Date('2026-03-01T00:00:00Z'), resolvedAt: new Date('2026-03-04T00:00:00Z'), severity: 'MEDIUM' },
      ];
      mockDefectQueries(defects);

      const result = await service.getDefectTimingStats(projectId);

      expect(result.avgMTTRHours).toBe(36);
      expect(result.medianMTTRHours).toBe(24);
    });

    it('should return zeroes when no defects exist', async () => {
      mockDefectQueries([], []);

      const result = await service.getDefectTimingStats(projectId);

      expect(result.avgMTTDHours).toBe(0);
      expect(result.avgMTTRHours).toBe(0);
      expect(result.medianMTTRHours).toBe(0);
      expect(result.mttrBySeverity).toEqual([]);
      expect(result.mttrTrend).toEqual([]);
      expect(result.openBurndown).toEqual([]);
    });

    it('should break down MTTR by severity', async () => {
      const defects = [
        { createdAt: new Date('2026-03-01T00:00:00Z'), resolvedAt: new Date('2026-03-01T10:00:00Z'), severity: 'CRITICAL' },
        { createdAt: new Date('2026-03-01T00:00:00Z'), resolvedAt: new Date('2026-03-01T20:00:00Z'), severity: 'CRITICAL' },
        { createdAt: new Date('2026-03-01T00:00:00Z'), resolvedAt: new Date('2026-03-03T00:00:00Z'), severity: 'LOW' },
      ];
      mockDefectQueries(defects);

      const result = await service.getDefectTimingStats(projectId);

      const critical = result.mttrBySeverity.find((s) => s.severity === 'CRITICAL');
      const low = result.mttrBySeverity.find((s) => s.severity === 'LOW');

      expect(critical).toBeDefined();
      expect(critical!.avgHours).toBe(15);
      expect(low).toBeDefined();
      expect(low!.avgHours).toBe(48);
    });

    it('should handle a single defect', async () => {
      const defects = [
        { createdAt: new Date('2026-03-01T00:00:00Z'), resolvedAt: new Date('2026-03-01T06:00:00Z'), severity: 'HIGH' },
      ];
      mockDefectQueries(defects);

      const result = await service.getDefectTimingStats(projectId);

      expect(result.avgMTTRHours).toBe(6);
      expect(result.medianMTTRHours).toBe(6);
      expect(result.mttrBySeverity).toHaveLength(1);
    });

    it('should always return avgMTTDHours as 0', async () => {
      const defects = [
        { createdAt: new Date('2026-03-01T00:00:00Z'), resolvedAt: new Date('2026-03-02T00:00:00Z'), severity: 'HIGH' },
      ];
      mockDefectQueries(defects);

      const result = await service.getDefectTimingStats(projectId);

      expect(result.avgMTTDHours).toBe(0);
    });

    it('should compute weekly mttrTrend from resolved defects', async () => {
      const defects = [
        { createdAt: new Date('2026-03-01T00:00:00Z'), resolvedAt: new Date('2026-03-02T00:00:00Z'), severity: 'HIGH' },
      ];
      mockDefectQueries(defects);

      const result = await service.getDefectTimingStats(projectId);

      expect(result.mttrTrend.length).toBeGreaterThan(0);
      expect(result.mttrTrend[0]).toHaveProperty('week');
      expect(result.mttrTrend[0]).toHaveProperty('avgHours');
    });

    it('should return openBurndown with weekly data points', async () => {
      const allDefects = [
        { createdAt: new Date('2026-01-01T00:00:00Z'), resolvedAt: null, closedAt: null, status: 'OPEN' },
        { createdAt: new Date('2026-02-01T00:00:00Z'), resolvedAt: new Date('2026-03-01T00:00:00Z'), closedAt: null, status: 'RESOLVED' },
      ];
      mockDefectQueries([], allDefects);

      const result = await service.getDefectTimingStats(projectId);

      expect(result.openBurndown.length).toBeGreaterThan(0);
      expect(result.openBurndown[0]).toHaveProperty('week');
      expect(result.openBurndown[0]).toHaveProperty('open');
    });

    it('should exclude resolved defects with no resolvedAt from burndown (e.g. Jira Won\'t Do)', async () => {
      const allDefects = [
        // Open defect — should count as open
        { createdAt: new Date('2026-01-01T00:00:00Z'), resolvedAt: null, closedAt: null, status: 'OPEN' },
        // "Won't Do" defect — RESOLVED status but no resolution date
        { createdAt: new Date('2026-01-15T00:00:00Z'), resolvedAt: null, closedAt: null, status: 'RESOLVED' },
        // Normal resolved defect with date
        { createdAt: new Date('2026-02-01T00:00:00Z'), resolvedAt: new Date('2026-02-10T00:00:00Z'), closedAt: null, status: 'RESOLVED' },
      ];
      mockDefectQueries([], allDefects);

      const result = await service.getDefectTimingStats(projectId);

      // The latest week should count only the OPEN defect, not the "Won't Do" one
      const lastWeek = result.openBurndown[result.openBurndown.length - 1];
      expect(lastWeek.open).toBe(1);
    });

    it('should round avgMTTRHours and medianMTTRHours to one decimal', async () => {
      const defects = [
        { createdAt: new Date('2026-03-01T00:00:00Z'), resolvedAt: new Date('2026-03-01T07:20:00Z'), severity: 'HIGH' },
        { createdAt: new Date('2026-03-01T00:00:00Z'), resolvedAt: new Date('2026-03-01T10:40:00Z'), severity: 'HIGH' },
      ];
      mockDefectQueries(defects);

      const result = await service.getDefectTimingStats(projectId);

      expect(result.avgMTTRHours).toBe(9);
      expect(result.medianMTTRHours).toBe(10.7);
    });
  });
});
