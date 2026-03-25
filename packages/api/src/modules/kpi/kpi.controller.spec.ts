import { KPIController } from './kpi.controller';
import { KPIService } from './kpi.service';

const PROJECT_ID = 'proj-uuid-1';

function createMockKPIService() {
  return {
    getKPIDashboard: vi.fn().mockResolvedValue({ metrics: [] }),
    getSnapshotHistory: vi.fn().mockResolvedValue([{ value: 95 }]),
    getTargets: vi.fn().mockResolvedValue([]),
    upsertTarget: vi.fn().mockResolvedValue({ metric: 'PASS_RATE', target: 95 }),
  };
}

describe('KPIController', () => {
  let controller: KPIController;
  let service: ReturnType<typeof createMockKPIService>;

  beforeEach(() => {
    service = createMockKPIService();
    controller = new KPIController(service as unknown as KPIService);
  });

  it('getDashboard passes projectId to service', async () => {
    const result = await controller.getDashboard(PROJECT_ID);
    expect(service.getKPIDashboard).toHaveBeenCalledWith(PROJECT_ID);
    expect(result).toEqual({ metrics: [] });
  });

  it('getHistory passes metric and defaults days to 30', async () => {
    await controller.getHistory(PROJECT_ID, 'PASS_RATE', undefined);
    expect(service.getSnapshotHistory).toHaveBeenCalledWith(PROJECT_ID, 'PASS_RATE', 30);
  });

  it('getHistory parses days query param', async () => {
    await controller.getHistory(PROJECT_ID, 'FLAKY_RATE', '14');
    expect(service.getSnapshotHistory).toHaveBeenCalledWith(PROJECT_ID, 'FLAKY_RATE', 14);
  });

  it('getTargets passes projectId to service', async () => {
    await controller.getTargets(PROJECT_ID);
    expect(service.getTargets).toHaveBeenCalledWith(PROJECT_ID);
  });

  it('upsertTarget passes projectId, metric, and body fields', async () => {
    const body = { target: 95, greenThreshold: 90, amberThreshold: 75 };
    const result = await controller.upsertTarget(PROJECT_ID, 'PASS_RATE', body);

    expect(service.upsertTarget).toHaveBeenCalledWith(PROJECT_ID, 'PASS_RATE', 95, 90, 75);
    expect(result).toEqual(expect.objectContaining({ metric: 'PASS_RATE', target: 95 }));
  });
});
