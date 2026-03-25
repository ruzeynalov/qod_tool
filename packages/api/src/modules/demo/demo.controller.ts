import { Controller, Get, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { DemoService } from './demo.service';

@Public()
@Controller('api/v1/projects/:projectId/demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  @Get('status')
  async getStatus(@Param('projectId', ParseUUIDPipe) projectId: string) {
    const demoMode = await this.demoService.isDemoMode(projectId);
    return { demoMode };
  }

  @Get('overview')
  getOverview(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.demoService.getDemoOverview(projectId);
  }

  @Get('test-cases')
  getTestCases(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('featureAreaId') featureAreaId?: string,
    @Query('type') type?: string,
  ) {
    return this.demoService.getDemoTestCases(projectId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      featureAreaId,
      type,
    });
  }

  @Get('test-runs')
  getTestRuns(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('branch') branch?: string,
  ) {
    return this.demoService.getDemoTestRuns(projectId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      status,
      branch,
    });
  }

  @Get('defects')
  getDefects(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('severity') severity?: string,
    @Query('status') status?: string,
  ) {
    return this.demoService.getDemoDefects(projectId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      severity,
      status,
    });
  }

  @Get('kpi-snapshots')
  getKPISnapshots(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('metric') metric?: string,
    @Query('days') days?: string,
  ) {
    return this.demoService.getDemoKPISnapshots(
      projectId,
      metric,
      days ? parseInt(days, 10) : undefined,
    );
  }

  @Get('pipeline-runs')
  getPipelineRuns(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.demoService.getDemoPipelineRuns(projectId);
  }
}
