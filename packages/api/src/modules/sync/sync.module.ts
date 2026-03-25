import { Module, forwardRef } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncSchedulerService } from './sync-scheduler.service';
import { ConnectorModule } from '../connector/connector.module';
import { AggregationModule } from '../aggregation/aggregation.module';

@Module({
  imports: [forwardRef(() => ConnectorModule), AggregationModule],
  providers: [SyncService, SyncSchedulerService],
  exports: [SyncService, SyncSchedulerService],
})
export class SyncModule {}
