import { DataController } from './data.controller';
import { DataService } from './data.service';

const PROJECT_ID = 'proj-uuid-1';
const TEST_CASE_ID = 'tc-uuid-1';
const RUN_ID = 'run-uuid-1';

function createMockDataService() {
  return {
    getProjectSummary: vi.fn().mockResolvedValue({ testCount: 42 }),
    getTestCaseFilterOptions: vi.fn().mockResolvedValue({ types: ['unit'] }),
    getTestCases: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    getTestRuns: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    getTestRunResults: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    getDefects: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    getStories: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    getPipelineRuns: vi.fn().mockResolvedValue([]),
    getTestCaseHistory: vi.fn().mockResolvedValue([]),
    getPassRateTrend: vi.fn().mockResolvedValue([]),
    getCoverageData: vi.fn().mockResolvedValue({ total: 100, covered: 80 }),
    getEpicCoverage: vi.fn().mockResolvedValue([]),
    getDefectTrend: vi.fn().mockResolvedValue([]),
    getFlakyTests: vi.fn().mockResolvedValue([]),
    getSeverityBreakdown: vi.fn().mockResolvedValue([]),
    getRerunStats: vi.fn().mockResolvedValue({}),
    getDefectTimingStats: vi.fn().mockResolvedValue({}),
  };
}

describe('DataController', () => {
  let controller: DataController;
  let service: ReturnType<typeof createMockDataService>;

  beforeEach(() => {
    service = createMockDataService();
    controller = new DataController(service as unknown as DataService);
  });

  it('getSummary calls dataService.getProjectSummary', async () => {
    const result = await controller.getSummary(PROJECT_ID);
    expect(service.getProjectSummary).toHaveBeenCalledWith(PROJECT_ID);
    expect(result).toEqual({ testCount: 42 });
  });

  it('getTestCaseFilterOptions calls dataService.getTestCaseFilterOptions', async () => {
    await controller.getTestCaseFilterOptions(PROJECT_ID);
    expect(service.getTestCaseFilterOptions).toHaveBeenCalledWith(PROJECT_ID);
  });

  it('getTestCases parses query params and passes filters', async () => {
    await controller.getTestCases(
      PROJECT_ID,
      'area-1',       // featureAreaId
      'unit',          // type
      'AUTOMATED',     // automationStatus
      'Smoke',         // suiteName
      'Functional',    // testRailType
      'true',          // hasReferences
      'JIRA-123',      // referenceSearch
      'login',         // search
      '2',             // page
      '25',            // pageSize
    );

    expect(service.getTestCases).toHaveBeenCalledWith(PROJECT_ID, {
      featureAreaId: 'area-1',
      type: 'unit',
      automationStatus: 'AUTOMATED',
      suiteName: 'Smoke',
      testRailType: 'Functional',
      hasReferences: true,
      referenceSearch: 'JIRA-123',
      search: 'login',
      page: 2,
      pageSize: 25,
    });
  });

  it('getTestCases caps pageSize at 100', async () => {
    await controller.getTestCases(
      PROJECT_ID,
      undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined,
      '1',
      '500',
    );

    expect(service.getTestCases).toHaveBeenCalledWith(PROJECT_ID, expect.objectContaining({
      pageSize: 100,
    }));
  });

  it('getTestCases converts hasReferences=false correctly', async () => {
    await controller.getTestCases(
      PROJECT_ID,
      undefined, undefined, undefined, undefined, undefined,
      'false', undefined, undefined, undefined, undefined,
    );

    expect(service.getTestCases).toHaveBeenCalledWith(PROJECT_ID, expect.objectContaining({
      hasReferences: false,
    }));
  });

  it('getTestRuns parses query params', async () => {
    await controller.getTestRuns(PROJECT_ID, 'PASSED', 'main', 'staging', 'smoke', '1', '50');
    expect(service.getTestRuns).toHaveBeenCalledWith(PROJECT_ID, {
      status: 'PASSED',
      branch: 'main',
      environment: 'staging',
      search: 'smoke',
      page: 1,
      pageSize: 50,
    });
  });

  it('getTestRunResults passes parsed pagination', async () => {
    await controller.getTestRunResults(RUN_ID, '3', '20');
    expect(service.getTestRunResults).toHaveBeenCalledWith(RUN_ID, {
      page: 3,
      pageSize: 20,
    });
  });

  it('getDefects parses filters', async () => {
    await controller.getDefects(PROJECT_ID, 'CRITICAL', 'OPEN', 'area-2', 'production', 'null ptr', '1', '10');
    expect(service.getDefects).toHaveBeenCalledWith(PROJECT_ID, {
      severity: 'CRITICAL',
      status: 'OPEN',
      featureAreaId: 'area-2',
      label: 'production',
      search: 'null ptr',
      page: 1,
      pageSize: 10,
    });
  });

  it('getStories parses filters', async () => {
    await controller.getStories(PROJECT_ID, 'IN_PROGRESS', 'backend', 'BREACH', 'auth', '1', '20');
    expect(service.getStories).toHaveBeenCalledWith(PROJECT_ID, {
      status: 'IN_PROGRESS',
      component: 'backend',
      label: 'BREACH',
      search: 'auth',
      page: 1,
      pageSize: 20,
    });
  });

  it('getPipelineRuns calls dataService.getPipelineRuns', async () => {
    await controller.getPipelineRuns(PROJECT_ID);
    expect(service.getPipelineRuns).toHaveBeenCalledWith(PROJECT_ID);
  });

  it('getTestCaseHistory calls with projectId and testCaseId', async () => {
    await controller.getTestCaseHistory(PROJECT_ID, TEST_CASE_ID);
    expect(service.getTestCaseHistory).toHaveBeenCalledWith(PROJECT_ID, TEST_CASE_ID);
  });

  it('getPassRateTrend defaults to 30 days', async () => {
    await controller.getPassRateTrend(PROJECT_ID, undefined);
    expect(service.getPassRateTrend).toHaveBeenCalledWith(PROJECT_ID, 30);
  });

  it('getPassRateTrend parses days param', async () => {
    await controller.getPassRateTrend(PROJECT_ID, '7');
    expect(service.getPassRateTrend).toHaveBeenCalledWith(PROJECT_ID, 7);
  });

  it('getCoverage calls dataService.getCoverageData', async () => {
    await controller.getCoverage(PROJECT_ID);
    expect(service.getCoverageData).toHaveBeenCalledWith(PROJECT_ID);
  });

  it('getEpicCoverage calls dataService.getEpicCoverage', async () => {
    await controller.getEpicCoverage(PROJECT_ID);
    expect(service.getEpicCoverage).toHaveBeenCalledWith(PROJECT_ID);
  });

  it('getDefectTrend calls dataService.getDefectTrend', async () => {
    await controller.getDefectTrend(PROJECT_ID);
    expect(service.getDefectTrend).toHaveBeenCalledWith(PROJECT_ID);
  });

  it('getFlakyTests calls dataService.getFlakyTests', async () => {
    await controller.getFlakyTests(PROJECT_ID);
    expect(service.getFlakyTests).toHaveBeenCalledWith(PROJECT_ID);
  });

  it('getSeverityBreakdown calls dataService.getSeverityBreakdown', async () => {
    await controller.getSeverityBreakdown(PROJECT_ID);
    expect(service.getSeverityBreakdown).toHaveBeenCalledWith(PROJECT_ID);
  });

  it('getRerunStats calls dataService.getRerunStats', async () => {
    await controller.getRerunStats(PROJECT_ID);
    expect(service.getRerunStats).toHaveBeenCalledWith(PROJECT_ID);
  });

  it('getDefectTiming calls dataService.getDefectTimingStats', async () => {
    await controller.getDefectTiming(PROJECT_ID);
    expect(service.getDefectTimingStats).toHaveBeenCalledWith(PROJECT_ID);
  });
});
