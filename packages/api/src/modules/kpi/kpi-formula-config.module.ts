import { Module } from '@nestjs/common';
import { KPIFormulaService } from './kpi-formula.service';

/**
 * Standalone module that owns the KPIFormulaService persistence/validation.
 * Lives separately from KPIModule so AggregationModule can depend on it
 * without producing a KPI ↔ Aggregation circular dependency.
 */
@Module({
  providers: [KPIFormulaService],
  exports: [KPIFormulaService],
})
export class KPIFormulaConfigModule {}
