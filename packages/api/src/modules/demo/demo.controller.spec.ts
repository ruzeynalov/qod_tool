import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

const PROJECT_ID = 'demo-proj-uuid';

function createMockDemoService() {
  return {
    isDemoMode: vi.fn().mockResolvedValue(true),
    getDemoOverview: vi.fn().mockResolvedValue({ testCount: 100 }),
    getDemoTestCases: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    getDemoTestRuns: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    getDemoDefects: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    getDemoKPISnapshots: vi.fn().mockResolvedValue([]),
    getDemoPipelineRuns: vi.fn().mockResolvedValue([]),
  };
}

describe('DemoController', () => {
  let controller: DemoController;
  let service: ReturnType<typeof createMockDemoService>;

  beforeEach(() => {
    service = createMockDemoService();
    controller = new DemoController(service as unknown as DemoService);
  });

  it('getStatus wraps isDemoMode result in { demoMode }', async () => {
    const result = await controller.getStatus(PROJECT_ID);
    expect(service.isDemoMode).toHaveBeenCalledWith(PROJECT_ID);
    expect(result).toEqual({ demoMode: true });
  });

  it('getOverview passes projectId to service', async () => {
    const result = await controller.getOverview(PROJECT_ID);
    expect(service.getDemoOverview).toHaveBeenCalledWith(PROJECT_ID);
    expect(result).toEqual({ testCount: 100 });
  });

  it('getTestCases parses pagination and filter params', async () => {
    await controller.getTestCases(PROJECT_ID, '2', '25', 'area-1', 'unit');
    expect(service.getDemoTestCases).toHaveBeenCalledWith(PROJECT_ID, {
      page: 2,
      limit: 25,
      featureAreaId: 'area-1',
      type: 'unit',
    });
  });

  it('getTestRuns parses pagination and filter params', async () => {
    await controller.getTestRuns(PROJECT_ID, '1', '10', 'PASSED', 'main');
    expect(service.getDemoTestRuns).toHaveBeenCalledWith(PROJECT_ID, {
      page: 1,
      limit: 10,
      status: 'PASSED',
      branch: 'main',
    });
  });

  it('getDefects parses pagination and filter params', async () => {
    await controller.getDefects(PROJECT_ID, '1', '20', 'CRITICAL', 'OPEN');
    expect(service.getDemoDefects).toHaveBeenCalledWith(PROJECT_ID, {
      page: 1,
      limit: 20,
      severity: 'CRITICAL',
      status: 'OPEN',
    });
  });

  it('getKPISnapshots parses metric and days params', async () => {
    await controller.getKPISnapshots(PROJECT_ID, 'PASS_RATE', '14');
    expect(service.getDemoKPISnapshots).toHaveBeenCalledWith(PROJECT_ID, 'PASS_RATE', 14);
  });

  it('getKPISnapshots passes undefined when optional params are omitted', async () => {
    await controller.getKPISnapshots(PROJECT_ID, undefined, undefined);
    expect(service.getDemoKPISnapshots).toHaveBeenCalledWith(PROJECT_ID, undefined, undefined);
  });

  it('getPipelineRuns passes projectId to service', async () => {
    await controller.getPipelineRuns(PROJECT_ID);
    expect(service.getDemoPipelineRuns).toHaveBeenCalledWith(PROJECT_ID);
  });
});
