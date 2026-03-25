import { Controller, Get, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { DataService } from './data.service';
import { ProjectAccessGuard } from '../../common/guards/project-access.guard';

@UseGuards(ProjectAccessGuard)
@Controller('api/v1/projects/:projectId')
export class DataController {
  constructor(private readonly dataService: DataService) {}

  @Get('summary')
  getSummary(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.dataService.getProjectSummary(projectId);
  }

  @Get('test-cases/filter-options')
  getTestCaseFilterOptions(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.dataService.getTestCaseFilterOptions(projectId);
  }

  @Get('test-cases')
  getTestCases(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('featureAreaId') featureAreaId?: string,
    @Query('type') type?: string,
    @Query('automationStatus') automationStatus?: string,
    @Query('suiteName') suiteName?: string,
    @Query('testRailType') testRailType?: string,
    @Query('hasReferences') hasReferences?: string,
    @Query('referenceSearch') referenceSearch?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.dataService.getTestCases(projectId, {
      featureAreaId,
      type,
      automationStatus,
      suiteName,
      testRailType,
      hasReferences: hasReferences === 'true' ? true : hasReferences === 'false' ? false : undefined,
      referenceSearch,
      search,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? Math.min(parseInt(pageSize, 10), 100) : undefined,
    });
  }

  @Get('test-runs')
  getTestRuns(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('status') status?: string,
    @Query('branch') branch?: string,
    @Query('environment') environment?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.dataService.getTestRuns(projectId, {
      status,
      branch,
      environment,
      search,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? Math.min(parseInt(pageSize, 10), 100) : undefined,
    });
  }

  @Get('test-runs/:runId/results')
  getTestRunResults(
    @Param('runId', ParseUUIDPipe) runId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.dataService.getTestRunResults(runId, {
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? Math.min(parseInt(pageSize, 10), 100) : undefined,
    });
  }

  @Get('defects/filter-options')
  getDefectFilterOptions(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.dataService.getDefectFilterOptions(projectId);
  }

  @Get('defects')
  getDefects(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('severity') severity?: string,
    @Query('status') status?: string,
    @Query('featureAreaId') featureAreaId?: string,
    @Query('label') label?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.dataService.getDefects(projectId, {
      severity,
      status,
      featureAreaId,
      label,
      search,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? Math.min(parseInt(pageSize, 10), 100) : undefined,
    });
  }

  @Get('stories/filter-options')
  getStoryFilterOptions(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.dataService.getStoryFilterOptions(projectId);
  }

  @Get('stories')
  getStories(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('status') status?: string,
    @Query('component') component?: string,
    @Query('label') label?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.dataService.getStories(projectId, {
      status,
      component,
      label,
      search,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? Math.min(parseInt(pageSize, 10), 100) : undefined,
    });
  }

  @Get('pipeline-runs')
  getPipelineRuns(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.dataService.getPipelineRuns(projectId);
  }

  @Get('test-cases/:testCaseId/history')
  getTestCaseHistory(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('testCaseId', ParseUUIDPipe) testCaseId: string,
  ) {
    return this.dataService.getTestCaseHistory(projectId, testCaseId);
  }

  @Get('analytics/pass-rate-trend')
  getPassRateTrend(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('days') days?: string,
  ) {
    return this.dataService.getPassRateTrend(projectId, days ? parseInt(days, 10) : 30);
  }

  @Get('analytics/coverage')
  getCoverage(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.dataService.getCoverageData(projectId);
  }

  @Get('analytics/epic-coverage')
  getEpicCoverage(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.dataService.getEpicCoverage(projectId);
  }

  @Get('analytics/defect-trend')
  getDefectTrend(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.dataService.getDefectTrend(projectId);
  }

  @Get('analytics/flaky-tests')
  getFlakyTests(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.dataService.getFlakyTests(projectId);
  }

  @Get('analytics/severity-breakdown')
  getSeverityBreakdown(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.dataService.getSeverityBreakdown(projectId);
  }

  @Get('analytics/rerun-stats')
  getRerunStats(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.dataService.getRerunStats(projectId);
  }

  @Get('analytics/defect-timing')
  getDefectTiming(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.dataService.getDefectTimingStats(projectId);
  }
}
