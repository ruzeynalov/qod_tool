import { ConfigService } from '@nestjs/config';
import { createPrismaMock } from '../../common/utils/prisma-mock';
import { AlertService } from './alert.service';

// ── BullMQ mocks ──────────────────────────────────────────────────

const mockQueue = {
  add: vi.fn().mockResolvedValue({}),
  close: vi.fn().mockResolvedValue(undefined),
  getRepeatableJobs: vi.fn().mockResolvedValue([]),
};

const mockWorker = {
  on: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
};

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => mockQueue),
  Worker: vi.fn().mockImplementation(() => mockWorker),
}));

// Import after mocking bullmq
import { AlertSchedulerService } from './alert-scheduler.service';

// ── Tests ─────────────────────────────────────────────────────────

describe('AlertSchedulerService', () => {
  let service: AlertSchedulerService;
  let alertService: { evaluateAlerts: ReturnType<typeof vi.fn> };
  let configService: { get: ReturnType<typeof vi.fn> };
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    vi.clearAllMocks();

    alertService = {
      evaluateAlerts: vi.fn().mockResolvedValue(undefined),
    };

    configService = {
      get: vi.fn().mockReturnValue('redis://localhost:6379'),
    };

    prisma = createPrismaMock();
    prisma.project.findMany.mockResolvedValue([
      { id: 'proj-1' },
      { id: 'proj-2' },
    ]);

    service = new AlertSchedulerService(
      alertService as unknown as AlertService,
      configService as unknown as ConfigService,
      prisma as any,
    );
  });

  // ── init ────────────────────────────────────────────────────────

  describe('onModuleInit', () => {
    it('should call scheduleAllProjects which fetches all projects and adds repeating jobs', async () => {
      await service.onModuleInit();

      expect(prisma.project.findMany).toHaveBeenCalledWith({
        select: { id: true },
      });
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'alert-eval',
        { projectId: 'proj-1' },
        expect.objectContaining({
          jobId: 'alert-eval-proj-1',
          repeat: { pattern: '*/5 * * * *' },
          removeOnComplete: true,
          removeOnFail: false,
          attempts: 2,
          backoff: { type: 'exponential', delay: 30_000 },
        }),
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'alert-eval',
        { projectId: 'proj-2' },
        expect.objectContaining({
          jobId: 'alert-eval-proj-2',
          repeat: { pattern: '*/5 * * * *' },
        }),
      );
    });
  });

  // ── job handling ────────────────────────────────────────────────

  describe('handleAlertJob', () => {
    it('should call alertService.evaluateAlerts with the project ID', async () => {
      const job = { data: { projectId: 'proj-1' } };

      await service.handleAlertJob(job as any);

      expect(alertService.evaluateAlerts).toHaveBeenCalledWith('proj-1');
    });
  });

  // ── error resilience ────────────────────────────────────────────

  describe('error resilience', () => {
    it('should log error and rethrow so BullMQ can retry', async () => {
      alertService.evaluateAlerts.mockRejectedValue(new Error('DB connection lost'));
      const job = { data: { projectId: 'proj-1' } };

      await expect(service.handleAlertJob(job as any)).rejects.toThrow('DB connection lost');

      expect(alertService.evaluateAlerts).toHaveBeenCalledWith('proj-1');
    });
  });

  // ── cleanup ─────────────────────────────────────────────────────

  describe('onModuleDestroy', () => {
    it('should close worker and queue', async () => {
      await service.onModuleDestroy();

      expect(mockWorker.close).toHaveBeenCalledOnce();
      expect(mockQueue.close).toHaveBeenCalledOnce();
    });
  });
});
