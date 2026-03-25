import { Module, forwardRef } from '@nestjs/common';
import { ConnectorService } from './connector.service';
import { ConnectorRegistryService } from './connector-registry.service';
import { ConnectorController } from './connector.controller';
import { SyncModule } from '../sync/sync.module';
import { AggregationModule } from '../aggregation/aggregation.module';
import { KPIModule } from '../kpi/kpi.module';

@Module({
  imports: [forwardRef(() => SyncModule), AggregationModule, KPIModule],
  controllers: [ConnectorController],
  providers: [ConnectorService, ConnectorRegistryService],
  exports: [ConnectorService, ConnectorRegistryService],
})
export class ConnectorModule {}
