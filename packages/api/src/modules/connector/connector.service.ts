import { Injectable, Logger } from '@nestjs/common';
import { ConnectorType, ConnectorStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CryptoService } from '../../common/utils/crypto.service';
import { CreateConnectorDto } from './dto/create-connector.dto';
import { UpdateConnectorDto } from './dto/update-connector.dto';

@Injectable()
export class ConnectorService {
  private readonly logger = new Logger(ConnectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async create(projectId: string, dto: CreateConnectorDto) {
    return this.prisma.connectorConfig.create({
      data: {
        projectId,
        connectorType: dto.connectorType as ConnectorType,
        name: dto.name,
        credentials: this.crypto.encryptJSON(dto.credentials),
        fieldMapping: dto.fieldMapping,
        syncSchedule: dto.syncSchedule,
        syncTimezone: dto.syncTimezone,
      },
    });
  }

  findAll(projectId: string) {
    return this.prisma.connectorConfig.findMany({ where: { projectId } });
  }

  async findById(id: string) {
    return this.prisma.connectorConfig.findUnique({ where: { id } });
  }

  async findByIdDecrypted(id: string) {
    const config = await this.prisma.connectorConfig.findUnique({ where: { id } });
    if (config && typeof config.credentials === 'string') {
      (config as any).credentials = this.crypto.decryptJSON(config.credentials as string);
    }
    return config;
  }

  async update(id: string, dto: UpdateConnectorDto) {
    this.logger.log(`Connector update called for ${id}, has credentials: ${!!dto.credentials}`);

    const data: Record<string, any> = {
      ...dto,
      ...(dto.connectorType && { connectorType: dto.connectorType as ConnectorType }),
      ...(dto.status && { status: dto.status as ConnectorStatus }),
    };

    let resolvedCredentials: Record<string, any> | null = null;
    if (dto.credentials) {
      resolvedCredentials = await this.stripMaskedCredentials(id, dto.credentials);
      this.logger.log(`Resolved credentials: ${resolvedCredentials ? 'non-null' : 'null'}, escapedLabel: ${resolvedCredentials?.escapedLabel ?? 'N/A'}`);
      if (resolvedCredentials) {
        data.credentials = this.crypto.encryptJSON(resolvedCredentials);
      } else {
        delete data.credentials;
      }
    }

    const updated = await this.prisma.connectorConfig.update({ where: { id }, data });
    this.logger.log(`Updated connector type: ${updated.connectorType}, projectId: ${updated.projectId}`);

    // When the escaped label changes on a JIRA connector, re-evaluate
    // isEscaped for all defects in the project based on their labels.
    if (resolvedCredentials && updated.connectorType === 'JIRA') {
      const escapedTag = (resolvedCredentials.escapedLabel || 'production').toLowerCase();
      this.logger.log(`Recomputing escaped defects with tag: "${escapedTag}"`);
      const result = await this.recomputeEscapedDefects(updated.projectId, escapedTag);
      this.logger.log(`Escaped defect recomputation complete`);
    } else {
      this.logger.log(`Skipping escaped recomputation: resolvedCredentials=${!!resolvedCredentials}, type=${updated.connectorType}`);
    }

    return updated;
  }

  /**
   * Re-evaluate `isEscaped` for every defect in the project.
   * A defect is escaped if any of its labels contains the escapedTag.
   */
  private async recomputeEscapedDefects(projectId: string, escapedTag: string) {
    // Mark matching defects as escaped
    await this.prisma.$executeRaw`
      UPDATE defects
      SET is_escaped = EXISTS (
        SELECT 1 FROM unnest(labels) AS l
        WHERE lower(l) LIKE '%' || ${escapedTag} || '%'
      )
      WHERE project_id = ${projectId}::uuid
        AND deleted_at IS NULL
    `;
  }

  /**
   * Filters masked credential placeholders ('***') from an incoming update.
   *
   * - If ALL values are '***', returns null (skip credential update entirely).
   * - If SOME values are '***', fetches existing credentials and merges:
   *   real incoming values overwrite, masked values keep existing.
   * - If NO values are '***', returns the credentials as-is.
   */
  private async stripMaskedCredentials(
    connectorId: string,
    incoming: Record<string, any>,
  ): Promise<Record<string, any> | null> {
    const MASK = '***';
    const entries = Object.entries(incoming);
    const maskedKeys = entries.filter(([, v]) => v === MASK).map(([k]) => k);

    // No masked values — use credentials as provided
    if (maskedKeys.length === 0) {
      return incoming;
    }

    // All values are masked — skip credential update entirely
    if (maskedKeys.length === entries.length) {
      return null;
    }

    // Partial mask — merge with existing credentials
    const existing = await this.prisma.connectorConfig.findUnique({
      where: { id: connectorId },
      select: { credentials: true },
    });

    const existingCreds: Record<string, any> =
      existing?.credentials && typeof existing.credentials === 'string'
        ? this.crypto.decryptJSON(existing.credentials as string)
        : (existing?.credentials as Record<string, any>) ?? {};

    const merged: Record<string, any> = {};
    for (const [key, value] of entries) {
      merged[key] = value === MASK ? existingCreds[key] : value;
    }
    return merged;
  }

  delete(id: string) {
    return this.prisma.connectorConfig.delete({ where: { id } });
  }

  updateSyncStatus(id: string, status: string, error?: string) {
    return this.prisma.connectorConfig.update({
      where: { id },
      data: {
        status: status as ConnectorStatus,
        lastSyncAt: new Date(),
        lastSyncError: error ?? null,
      },
    });
  }

  getActiveConnectors() {
    return this.prisma.connectorConfig.findMany({
      where: { status: 'ACTIVE' },
    });
  }
}
