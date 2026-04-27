import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job } from 'bullmq';
import { AlertService } from './alert.service';
import { PrismaService } from '../../database/prisma.service';

interface AlertJobData {
  projectId: string;
}

@Injectable()
export class AlertSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertSchedulerService.name);
  private readonly queue: Queue<AlertJobData>;
  private readonly worker: Worker<AlertJobData>;

  constructor(
    private readonly alertService: AlertService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const redisUrl = this.configService.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    const connection = { url: redisUrl, maxRetriesPerRequest: null } as any;

    this.queue = new Queue('alert-evaluation-jobs', { connection });

    this.worker = new Worker(
      'alert-evaluation-jobs',
      async (job: Job<AlertJobData>) => this.handleAlertJob(job),
      { connection },
    );

    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      this.logger.error(
        `Alert evaluation job ${job?.id ?? 'unknown'} failed: ${err.message}`,
      );
    });
  }

  async onModuleInit(): Promise<void> {
    await this.scheduleAllProjects();
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down alert scheduler...');
    await this.worker.close();
    await this.queue.close();
    this.logger.log('Alert scheduler shut down');
  }

  async scheduleAllProjects(): Promise<void> {
    const projects = await this.prisma.project.findMany({
      select: { id: true },
    });

    for (const project of projects) {
      await this.queue.add(
        'alert-eval',
        { projectId: project.id },
        {
          jobId: `alert-eval-${project.id}`,
          repeat: { pattern: '*/5 * * * *' },
          removeOnComplete: true,
          removeOnFail: false,
          attempts: 2,
          backoff: { type: 'exponential', delay: 30_000 },
        },
      );
    }

    this.logger.log(`Scheduled alert evaluation for ${projects.length} projects`);
  }

  async handleAlertJob(job: Job<AlertJobData>): Promise<void> {
    const { projectId } = job.data;

    this.logger.log(`Evaluating alerts for project ${projectId}`);

    try {
      await this.alertService.evaluateAlerts(projectId);
      this.logger.log(`Alert evaluation completed for project ${projectId}`);
    } catch (error) {
      this.logger.error(
        `Alert evaluation failed for project ${projectId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
