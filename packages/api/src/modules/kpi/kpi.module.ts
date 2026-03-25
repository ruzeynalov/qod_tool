import { Module } from '@nestjs/common';
import { KPIService } from './kpi.service';
import { KPIController } from './kpi.controller';

@Module({
  controllers: [KPIController],
  providers: [KPIService],
  exports: [KPIService],
})
export class KPIModule {}
