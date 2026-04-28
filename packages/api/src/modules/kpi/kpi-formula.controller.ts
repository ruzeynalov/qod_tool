import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { KPIMetricKey } from '@qod/shared';
import { ProjectAccessGuard } from '../../common/guards/project-access.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditAction } from '../../common/interceptors/audit-log.interceptor';
import { AggregationService } from '../aggregation/aggregation.service';
import {
  KPI_FORMULA_DEFINITION_LIST,
  buildResolvedConfig,
  resolveParameters,
} from './kpi-formula.definitions';
import { KPIFormulaService } from './kpi-formula.service';
import { KPIService } from './kpi.service';
import { UpsertFormulaDto } from './dto/upsert-formula.dto';
import { PreviewFormulaDto } from './dto/preview-formula.dto';

@UseGuards(ProjectAccessGuard)
@Controller('api/v1/projects/:projectId/kpis/formulas')
export class KPIFormulaController {
  constructor(
    private readonly formulaService: KPIFormulaService,
    private readonly aggregationService: AggregationService,
    private readonly kpiService: KPIService,
  ) {}

  @Get()
  async list(@Param('projectId', ParseUUIDPipe) projectId: string) {
    const configs = await this.formulaService.resolveAll(projectId);
    return {
      definitions: KPI_FORMULA_DEFINITION_LIST,
      configs: Object.values(configs),
    };
  }

  @Get(':metric')
  async getOne(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('metric') metric: string,
  ) {
    const resolved = await this.formulaService.resolve(projectId, metric as KPIMetricKey);
    const definition = KPI_FORMULA_DEFINITION_LIST.find((d) => d.metric === metric);
    return { definition, config: resolved };
  }

  @Put(':metric')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @AuditAction({ action: 'kpi_formula.updated', entityType: 'KPIFormulaConfig' })
  async upsert(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('metric') metric: string,
    @Body() body: UpsertFormulaDto,
    @Req() req: { user?: { userId?: string } },
  ) {
    const resolved = await this.formulaService.upsert(
      projectId,
      metric as KPIMetricKey,
      body.parameters ?? {},
      body.expression ?? null,
      req.user?.userId ?? null,
    );
    // The dashboard cache keys on (projectId) and the resolved config affects
    // the next runAggregation only — but the dashboard also surfaces
    // formula-changed markers, so refresh it.
    this.kpiService.invalidateCache(projectId);
    return resolved;
  }

  @Post(':metric/preview')
  async preview(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('metric') metric: string,
    @Body() body: PreviewFormulaDto,
  ) {
    const metricKey = metric as KPIMetricKey;
    // Validate first so users see precise errors before we run any queries.
    this.formulaService.validate(metricKey, body.parameters ?? {}, body.expression ?? null);

    const resolved = buildResolvedConfig(metricKey, {
      parameters: resolveParameters(metricKey, body.parameters ?? {}),
      expression: body.expression ?? null,
      updatedAt: new Date(),
      updatedById: null,
    });

    return this.aggregationService.previewMetric(projectId, metricKey, resolved);
  }

  @Post(':metric/reset')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @AuditAction({ action: 'kpi_formula.reset', entityType: 'KPIFormulaConfig' })
  async reset(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('metric') metric: string,
  ) {
    const resolved = await this.formulaService.reset(projectId, metric as KPIMetricKey);
    this.kpiService.invalidateCache(projectId);
    return resolved;
  }
}
