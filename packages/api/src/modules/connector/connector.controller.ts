import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  ParseUUIDPipe,
  HttpCode,
} from '@nestjs/common';
import { ConnectorService } from './connector.service';
import { ConnectorRegistryService } from './connector-registry.service';
import { CreateConnectorDto } from './dto/create-connector.dto';
import { UpdateConnectorDto } from './dto/update-connector.dto';
import { SyncSchedulerService } from '../sync/sync-scheduler.service';
import { AggregationService } from '../aggregation/aggregation.service';
import { KPIService } from '../kpi/kpi.service';
import { ProjectAccessGuard } from '../../common/guards/project-access.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditAction } from '../../common/interceptors/audit-log.interceptor';

/** Mask sensitive credential fields, replacing values with '***'. */
function maskCredentials(credentials: unknown): Record<string, unknown> {
  if (!credentials || typeof credentials !== 'object') return {};
  const masked: Record<string, unknown> = {};
  const sensitiveKeys = /^(token|password|secret|apiKey|api_key|apiToken)$/i;
  for (const [key, value] of Object.entries(credentials as Record<string, unknown>)) {
    if (sensitiveKeys.test(key) && typeof value === 'string') {
      masked[key] = '***';
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

@UseGuards(ProjectAccessGuard)
@Controller('api/v1/projects/:projectId/connectors')
export class ConnectorController {
  constructor(
    private readonly connectorService: ConnectorService,
    private readonly connectorRegistry: ConnectorRegistryService,
    private readonly syncScheduler: SyncSchedulerService,
    private readonly aggregationService: AggregationService,
    private readonly kpiService: KPIService,
  ) {}

  @Get()
  async findAll(@Param('projectId', ParseUUIDPipe) projectId: string) {
    const connectors = await this.connectorService.findAll(projectId);
    // Exclude credentials from list responses
    return connectors.map(({ credentials, ...rest }: any) => rest);
  }

  @Get('export')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async exportAll(@Param('projectId', ParseUUIDPipe) projectId: string) {
    const connectors = await this.connectorService.findAll(projectId);
    const result = [];
    for (const c of connectors) {
      const decrypted = await this.connectorService.findByIdDecrypted(c.id);
      result.push({
        connectorType: c.connectorType,
        name: c.name,
        credentials: decrypted?.credentials ?? {},
        fieldMapping: c.fieldMapping ?? {},
        syncSchedule: c.syncSchedule ?? '0 * * * *',
        syncTimezone: (c as any).syncTimezone ?? 'UTC',
      });
    }
    return result;
  }

  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    const config = await this.connectorService.findByIdDecrypted(id);
    if (!config) return null;
    // Mask sensitive credential fields
    return {
      ...config,
      credentials: maskCredentials(config.credentials as Record<string, unknown>),
    };
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @AuditAction({ action: 'connector.created', entityType: 'ConnectorConfig' })
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateConnectorDto,
  ) {
    return this.connectorService.create(projectId, dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @AuditAction({ action: 'connector.updated', entityType: 'ConnectorConfig' })
  async update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConnectorDto,
  ) {
    const result = await this.connectorService.update(id, dto);

    // Re-aggregate KPIs when JIRA credentials change (escaped label may have updated isEscaped)
    if (result.connectorType === 'JIRA' && dto.credentials) {
      await this.aggregationService.runAggregation(projectId);
      this.kpiService.invalidateCache(projectId);
    }

    return result;
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @AuditAction({ action: 'connector.deleted', entityType: 'ConnectorConfig' })
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.connectorService.delete(id);
  }

  @Post(':id/test')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async testConnection(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const config = await this.connectorService.findByIdDecrypted(id);
    if (!config) {
      throw new NotFoundException('Connector not found');
    }

    const connector = this.connectorRegistry.get(config.connectorType.toLowerCase());
    if (!connector) {
      throw new BadRequestException(`No connector implementation for ${config.connectorType}`);
    }

    const result = await connector.testConnection({
      id: config.id,
      connectorType: config.connectorType,
      credentials: config.credentials as Record<string, unknown>,
      fieldMapping: config.fieldMapping as Record<string, string>,
      syncSchedule: config.syncSchedule,
      syncCursor: (config.syncCursor as Record<string, unknown>) ?? undefined,
    });

    if (!result.success) {
      throw new BadRequestException(result.error || 'Connection test failed');
    }

    return result;
  }

  @Post(':id/sync')
  @HttpCode(202)
  async triggerSync(
    @Param('projectId', ParseUUIDPipe) _projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    try {
      const { jobId } = await this.syncScheduler.queueManualSync(id);
      return {
        success: true,
        status: 'queued',
        jobId,
        message: 'Sync queued. Connector status will update when the job finishes.',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new InternalServerErrorException(message);
    }
  }
}
