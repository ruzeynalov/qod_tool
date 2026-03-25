import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job } from 'bullmq';
import { SyncService } from './sync.service';
import { ConnectorService } from '../connector/connector.service';
import { AggregationService } from '../aggregation/aggregation.service';

interface SyncJobData {
  connectorConfigId: string;
}

@Injectable()
export class SyncSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyncSchedulerService.name);
  private readonly queue: Queue<SyncJobData>;
  private readonly worker: Worker<SyncJobData>;

  constructor(
    private readonly syncService: SyncService,
    private readonly connectorService: ConnectorService,
    private readonly aggregationService: AggregationService,
    private readonly configService: ConfigService,
  ) {
    const redisUrl = this.configService.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    // Use URL-based connection config compatible with BullMQ's bundled ioredis
    const connection = { url: redisUrl, maxRetriesPerRequest: null } as any;

    this.queue = new Queue('sync-jobs', { connection });

    this.worker = new Worker(
      'sync-jobs',
      async (job: Job<SyncJobData>) => this.handleSyncJob(job),
      { connection },
    );

    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      this.logger.error(
        `Sync job ${job?.id ?? 'unknown'} failed: ${err.message}`,
      );
    });
  }

  async onModuleInit(): Promise<void> {
    await this.scheduleAllConnectors();
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down sync scheduler...');
    await this.worker.close();
    await this.queue.close();
    this.logger.log('Sync scheduler shut down');
  }

  async scheduleAllConnectors(): Promise<void> {
    const connectors = await this.connectorService.getActiveConnectors();

    for (const connector of connectors) {
      if (!connector.syncSchedule) {
        this.logger.warn(
          `Connector ${connector.id} has no syncSchedule, skipping`,
        );
        continue;
      }

      try {
        await this.scheduleConnector(
          connector.id,
          connector.syncSchedule,
          connector.syncTimezone ?? 'UTC',
        );
      } catch (error) {
        this.logger.error(
          `Failed to schedule connector ${connector.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  async scheduleConnector(
    connectorConfigId: string,
    cronSchedule: string,
    timezone: string = 'UTC',
  ): Promise<void> {
    await this.queue.add(
      'sync',
      { connectorConfigId },
      {
        jobId: `sync-${connectorConfigId}`,
        repeat: { pattern: cronSchedule, tz: timezone },
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
      },
    );

    this.logger.log(
      `Scheduled sync for connector ${connectorConfigId} with cron: ${cronSchedule} (tz: ${timezone})`,
    );
  }

  async removeConnectorSchedule(connectorConfigId: string): Promise<void> {
    const repeatableJobs = await this.queue.getRepeatableJobs();
    const jobId = `sync-${connectorConfigId}`;

    for (const job of repeatableJobs) {
      if (job.id === jobId) {
        await this.queue.removeRepeatableByKey(job.key);
        this.logger.log(
          `Removed scheduled sync for connector ${connectorConfigId}`,
        );
        return;
      }
    }

    this.logger.warn(
      `No repeatable job found for connector ${connectorConfigId}`,
    );
  }

  async handleSyncJob(job: Job<SyncJobData>): Promise<void> {
    const { connectorConfigId } = job.data;

    this.logger.log(`Processing sync job for connector ${connectorConfigId}`);

    await this.syncService.executeSyncJob(connectorConfigId);

    // Look up the connector to get the projectId for aggregation
    const connector = await this.connectorService.findById(connectorConfigId);

    if (connector) {
      try {
        await this.aggregationService.runAggregation(connector.projectId);
      } catch (error) {
        this.logger.error(
          `Aggregation failed for project ${connector.projectId}, re-queuing: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Re-queue a lightweight aggregation-only job
        await this.queue.add(
          'aggregation-retry',
          { connectorConfigId },
          {
            delay: 30_000,
            attempts: 2,
            backoff: { type: 'exponential', delay: 30_000 },
            removeOnComplete: true,
          },
        );
      }
    } else {
      this.logger.warn(
        `Connector config ${connectorConfigId} not found, skipping aggregation`,
      );
    }
  }
}
