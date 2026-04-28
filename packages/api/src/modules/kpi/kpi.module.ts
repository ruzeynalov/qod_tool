import { Module } from '@nestjs/common';
import { AggregationModule } from '../aggregation/aggregation.module';
import { KPIController } from './kpi.controller';
import { KPIFormulaConfigModule } from './kpi-formula-config.module';
import { KPIFormulaController } from './kpi-formula.controller';
import { KPIService } from './kpi.service';

@Module({
  imports: [KPIFormulaConfigModule, AggregationModule],
  controllers: [KPIController, KPIFormulaController],
  providers: [KPIService],
  exports: [KPIService],
})
export class KPIModule {}
