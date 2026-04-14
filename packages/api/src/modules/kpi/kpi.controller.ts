import {
  Controller,
  Get,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { KPIService } from './kpi.service';
import { UpsertTargetDto } from './dto/upsert-target.dto';
import { ProjectAccessGuard } from '../../common/guards/project-access.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

const VALID_KPI_METRICS = [
  'PASS_RATE',
  'COVERAGE_PCT',
  'FLAKY_RATE',
  'MTTD',
  'MTTR',
  'ESCAPE_RATE',
  'EXEC_VELOCITY',
  'REQ_COVERAGE',
  'READINESS_SCORE',
];

@UseGuards(ProjectAccessGuard)
@Controller('api/v1/projects/:projectId/kpis')
export class KPIController {
  constructor(private readonly kpiService: KPIService) {}

  @Get()
  getDashboard(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.kpiService.getKPIDashboard(projectId);
  }

  @Get('history/:metric')
  getHistory(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('metric') metric: string,
    @Query('days') days?: string,
  ) {
    if (!VALID_KPI_METRICS.includes(metric)) {
      throw new BadRequestException(`Invalid KPI metric: ${metric}`);
    }
    return this.kpiService.getSnapshotHistory(
      projectId,
      metric,
      days ? parseInt(days, 10) : 30,
    );
  }

  @Get('targets')
  getTargets(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.kpiService.getTargets(projectId);
  }

  @Put('targets/:metric')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  upsertTarget(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('metric') metric: string,
    @Body() body: UpsertTargetDto,
  ) {
    if (!VALID_KPI_METRICS.includes(metric)) {
      throw new BadRequestException(`Invalid KPI metric: ${metric}`);
    }
    return this.kpiService.upsertTarget(
      projectId,
      metric,
      body.target,
      body.greenThreshold,
      body.amberThreshold,
    );
  }
}
