import { Module } from '@nestjs/common';
import { KPIFormulaConfigModule } from '../kpi/kpi-formula-config.module';
import { AggregationService } from './aggregation.service';

@Module({
  imports: [KPIFormulaConfigModule],
  providers: [AggregationService],
  exports: [AggregationService],
})
export class AggregationModule {}
