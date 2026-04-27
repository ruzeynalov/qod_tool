import { Module } from '@nestjs/common';
import { AlertController } from './alert.controller';
import { AlertService } from './alert.service';
import { AlertSchedulerService } from './alert-scheduler.service';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  controllers: [AlertController],
  providers: [AlertService, AlertSchedulerService, RolesGuard],
  exports: [AlertService],
})
export class AlertModule {}
