import { ConfigService } from '@nestjs/config';
import { SyncSchedulerService } from './sync-scheduler.service';
import { SyncService } from './sync.service';
import { ConnectorService } from '../connector/connector.service';
import { AggregationService } from '../aggregation/aggregation.service';

// ── BullMQ mocks ──────────────────────────────────────────────────

const mockQueue = {
  add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  getRepeatableJobs: vi.fn().mockResolvedValue([]),
  removeRepeatableByKey: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
};

const mockWorker = {
  close: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
};

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => mockQueue),
  Worker: vi.fn().mockImplementation((_name: string, processor: any) => {
    // Store processor so tests can invoke it
    mockWorker._processor = processor;
    return mockWorker;
  }),
}));

// ── Helpers ───────────────────────────────────────────────────────

function makeConnector(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conn-1',
    projectId: 'project-1',
    connectorType: 'GITHUB',
    name: 'GitHub',
    syncSchedule: '*/15 * * * *',
    syncTimezone: 'UTC',
    status: 'ACTIVE',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────

describe('SyncSchedulerService', () => {
  let service: SyncSchedulerService;
  let syncService: { executeSyncJob: ReturnType<typeof vi.fn> };
  let connectorService: { getActiveConnectors: ReturnType<typeof vi.fn> };
  let aggregationService: { runAggregation: ReturnType<typeof vi.fn> };
  let configService: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    syncService = {
      executeSyncJob: vi.fn().mockResolvedValue(undefined),
    };

    connectorService = {
      getActiveConnectors: vi.fn().mockResolvedValue([]),
    };

    aggregationService = {
      runAggregation: vi.fn().mockResolvedValue(undefined),
    };

    configService = {
      get: vi.fn().mockReturnValue('redis://localhost:6379'),
    };

    service = new SyncSchedulerService(
      syncService as unknown as SyncService,
      connectorService as unknown as ConnectorService,
      aggregationService as unknown as AggregationService,
      configService as unknown as ConfigService,
    );
  });

  // ── onModuleInit ────────────────────────────────────────────────

  describe('onModuleInit', () => {
    it('should call scheduleAllConnectors on init', async () => {
      const spy = vi.spyOn(service, 'scheduleAllConnectors').mockResolvedValue(undefined);

      await service.onModuleInit();

      expect(spy).toHaveBeenCalledOnce();
    });
  });

  // ── scheduleAllConnectors ───────────────────────────────────────

  describe('scheduleAllConnectors', () => {
    it('should read all ACTIVE connectors and schedule each one', async () => {
      const connectors = [
        makeConnector({ id: 'conn-1', syncSchedule: '*/15 * * * *' }),
        makeConnector({ id: 'conn-2', syncSchedule: '0 * * * *' }),
      ];
      connectorService.getActiveConnectors.mockResolvedValue(connectors);

      await service.scheduleAllConnectors();

      expect(connectorService.getActiveConnectors).toHaveBeenCalledOnce();
      expect(mockQueue.add).toHaveBeenCalledTimes(2);

      // First connector
      expect(mockQueue.add).toHaveBeenCalledWith(
        'sync',
        { connectorConfigId: 'conn-1' },
        expect.objectContaining({
          jobId: 'sync-conn-1',
          repeat: { pattern: '*/15 * * * *', tz: 'UTC' },
          attempts: 3,
          backoff: { type: 'exponential', delay: 60_000 },
        }),
      );

      // Second connector
      expect(mockQueue.add).toHaveBeenCalledWith(
        'sync',
        { connectorConfigId: 'conn-2' },
        expect.objectContaining({
          jobId: 'sync-conn-2',
          repeat: { pattern: '0 * * * *', tz: 'UTC' },
          attempts: 3,
          backoff: { type: 'exponential', delay: 60_000 },
        }),
      );
    });

    it('should handle empty connector list gracefully', async () => {
      connectorService.getActiveConnectors.mockResolvedValue([]);

      await service.scheduleAllConnectors();

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should skip connectors without a syncSchedule', async () => {
      const connectors = [
        makeConnector({ id: 'conn-1', syncSchedule: '*/15 * * * *' }),
        makeConnector({ id: 'conn-2', syncSchedule: null }),
      ];
      connectorService.getActiveConnectors.mockResolvedValue(connectors);

      await service.scheduleAllConnectors();

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'sync',
        { connectorConfigId: 'conn-1' },
        expect.objectContaining({
          jobId: 'sync-conn-1',
          repeat: { pattern: '*/15 * * * *', tz: 'UTC' },
          attempts: 3,
          backoff: { type: 'exponential', delay: 60_000 },
        }),
      );
    });
  });

  // ── scheduleConnector ───────────────────────────────────────────

  describe('scheduleConnector', () => {
    it('should add a repeatable job with the given cron schedule and timezone', async () => {
      await service.scheduleConnector('conn-1', '*/10 * * * *', 'America/New_York');

      expect(mockQueue.add).toHaveBeenCalledWith(
        'sync',
        { connectorConfigId: 'conn-1' },
        {
          jobId: 'sync-conn-1',
          repeat: { pattern: '*/10 * * * *', tz: 'America/New_York' },
          removeOnComplete: true,
          removeOnFail: false,
          attempts: 3,
          backoff: { type: 'exponential', delay: 60_000 },
        },
      );
    });

    it('should default to UTC when no timezone is provided', async () => {
      await service.scheduleConnector('conn-1', '0 0 * * *');

      expect(mockQueue.add).toHaveBeenCalledWith(
        'sync',
        { connectorConfigId: 'conn-1' },
        expect.objectContaining({
          repeat: { pattern: '0 0 * * *', tz: 'UTC' },
        }),
      );
    });
  });

  // ── removeConnectorSchedule ─────────────────────────────────────

  describe('removeConnectorSchedule', () => {
    it('should remove the repeatable job by key', async () => {
      mockQueue.getRepeatableJobs.mockResolvedValue([
        { key: 'sync:conn-1:::*/10 * * * *', id: 'sync-conn-1' },
        { key: 'sync:conn-2:::0 * * * *', id: 'sync-conn-2' },
      ]);

      await service.removeConnectorSchedule('conn-1');

      expect(mockQueue.getRepeatableJobs).toHaveBeenCalled();
      expect(mockQueue.removeRepeatableByKey).toHaveBeenCalledWith(
        'sync:conn-1:::*/10 * * * *',
      );
    });

    it('should not throw if no matching repeatable job found', async () => {
      mockQueue.getRepeatableJobs.mockResolvedValue([
        { key: 'sync:conn-99:::0 * * * *', id: 'sync-conn-99' },
      ]);

      await expect(
        service.removeConnectorSchedule('conn-1'),
      ).resolves.not.toThrow();

      expect(mockQueue.removeRepeatableByKey).not.toHaveBeenCalled();
    });
  });

  // ── handleSyncJob ───────────────────────────────────────────────

  describe('handleSyncJob', () => {
    it('should call syncService.executeSyncJob and aggregationService.runAggregation', async () => {
      const connector = makeConnector({ id: 'conn-1', projectId: 'proj-1' });
      connectorService.getActiveConnectors.mockResolvedValue([connector]);

      // We need findById for the handleSyncJob to look up the connector
      (connectorService as any).findById = vi.fn().mockResolvedValue(connector);

      const job = {
        data: { connectorConfigId: 'conn-1' },
      };

      await service.handleSyncJob(job as any);

      expect(syncService.executeSyncJob).toHaveBeenCalledWith('conn-1');
      expect(aggregationService.runAggregation).toHaveBeenCalledWith('proj-1');
    });

    it('should still call aggregation even if executeSyncJob does not throw (sync handles errors internally)', async () => {
      const connector = makeConnector({ id: 'conn-1', projectId: 'proj-1' });
      (connectorService as any).findById = vi.fn().mockResolvedValue(connector);

      syncService.executeSyncJob.mockResolvedValue(undefined);

      const job = { data: { connectorConfigId: 'conn-1' } };

      await service.handleSyncJob(job as any);

      expect(aggregationService.runAggregation).toHaveBeenCalledWith('proj-1');
    });

    it('should skip aggregation if connector config not found', async () => {
      (connectorService as any).findById = vi.fn().mockResolvedValue(null);

      const job = { data: { connectorConfigId: 'conn-unknown' } };

      await service.handleSyncJob(job as any);

      expect(syncService.executeSyncJob).toHaveBeenCalledWith('conn-unknown');
      expect(aggregationService.runAggregation).not.toHaveBeenCalled();
    });
  });

  // ── Error isolation ─────────────────────────────────────────────

  describe('error isolation', () => {
    it('error in one connector schedule should not block others', async () => {
      const connectors = [
        makeConnector({ id: 'conn-1', syncSchedule: '*/15 * * * *' }),
        makeConnector({ id: 'conn-2', syncSchedule: '0 * * * *' }),
        makeConnector({ id: 'conn-3', syncSchedule: '30 * * * *' }),
      ];
      connectorService.getActiveConnectors.mockResolvedValue(connectors);

      // Second connector fails to schedule
      mockQueue.add
        .mockResolvedValueOnce({ id: 'job-1' })
        .mockRejectedValueOnce(new Error('Redis timeout'))
        .mockResolvedValueOnce({ id: 'job-3' });

      await service.scheduleAllConnectors();

      // Should still attempt all three
      expect(mockQueue.add).toHaveBeenCalledTimes(3);
    });
  });
});
