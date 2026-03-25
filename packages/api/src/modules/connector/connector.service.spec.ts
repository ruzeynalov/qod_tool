import { ConnectorService } from './connector.service';
import {
  createPrismaMock,
  PrismaMock,
} from '../../common/utils/prisma-mock';
import { PrismaService } from '../../database/prisma.service';
import { CryptoService } from '../../common/utils/crypto.service';
import { CreateConnectorDto } from './dto/create-connector.dto';
import { UpdateConnectorDto } from './dto/update-connector.dto';

describe('ConnectorService', () => {
  let service: ConnectorService;
  let prisma: PrismaMock;
  let cryptoService: CryptoService;

  beforeEach(() => {
    prisma = createPrismaMock();
    // Create a CryptoService with no encryption key (passthrough mode)
    cryptoService = {
      encrypt: vi.fn((v: string) => v),
      decrypt: vi.fn((v: string) => v),
      encryptJSON: vi.fn((obj: Record<string, any>) => JSON.stringify(obj)),
      decryptJSON: vi.fn((v: string) => JSON.parse(v)),
    } as unknown as CryptoService;
    service = new ConnectorService(prisma as unknown as PrismaService, cryptoService);
  });

  describe('create', () => {
    it('should create a connector config and return it', async () => {
      const projectId = 'project-uuid';
      const dto: CreateConnectorDto = {
        connectorType: 'GITHUB',
        name: 'GitHub - my-org/my-repo',
        credentials: { token: 'ghp_xxx' },
        fieldMapping: { status: 'state' },
        syncSchedule: '*/30 * * * *',
      };

      const expected = {
        id: 'connector-uuid',
        projectId,
        connectorType: dto.connectorType,
        name: dto.name,
        credentials: dto.credentials,
        fieldMapping: dto.fieldMapping,
        syncSchedule: dto.syncSchedule,
        status: 'ACTIVE',
        lastSyncAt: null,
        lastSyncError: null,
        syncCursor: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.connectorConfig.create.mockResolvedValue(expected);

      const result = await service.create(projectId, dto);

      expect(prisma.connectorConfig.create).toHaveBeenCalledWith({
        data: {
          projectId,
          connectorType: dto.connectorType,
          name: dto.name,
          credentials: expect.any(String),
          fieldMapping: dto.fieldMapping,
          syncSchedule: dto.syncSchedule,
          syncTimezone: undefined,
        },
      });
      expect(cryptoService.encryptJSON).toHaveBeenCalledWith(dto.credentials);
      expect(result).toEqual(expected);
    });

    it('should use default values when optional fields are omitted', async () => {
      const projectId = 'project-uuid';
      const dto: CreateConnectorDto = {
        connectorType: 'TESTRAIL',
        name: 'TestRail',
        credentials: { apiKey: 'key' },
      };

      const expected = { id: 'connector-uuid', projectId };
      prisma.connectorConfig.create.mockResolvedValue(expected);

      await service.create(projectId, dto);

      expect(prisma.connectorConfig.create).toHaveBeenCalledWith({
        data: {
          projectId,
          connectorType: dto.connectorType,
          name: dto.name,
          credentials: expect.any(String),
          fieldMapping: undefined,
          syncSchedule: undefined,
          syncTimezone: undefined,
        },
      });
    });
  });

  describe('findAll', () => {
    it('should return all connectors for a project', async () => {
      const projectId = 'project-uuid';
      const connectors = [
        { id: 'c1', projectId, name: 'GitHub' },
        { id: 'c2', projectId, name: 'Jira' },
      ];

      prisma.connectorConfig.findMany.mockResolvedValue(connectors);

      const result = await service.findAll(projectId);

      expect(prisma.connectorConfig.findMany).toHaveBeenCalledWith({
        where: { projectId },
      });
      expect(result).toEqual(connectors);
    });
  });

  describe('findById', () => {
    it('should return a single connector by id', async () => {
      const connector = { id: 'connector-uuid', name: 'GitHub' };
      prisma.connectorConfig.findUnique.mockResolvedValue(connector);

      const result = await service.findById('connector-uuid');

      expect(prisma.connectorConfig.findUnique).toHaveBeenCalledWith({
        where: { id: 'connector-uuid' },
      });
      expect(result).toEqual(connector);
    });
  });

  describe('update', () => {
    it('should update a connector config and return it', async () => {
      const dto: UpdateConnectorDto = {
        name: 'Updated Name',
        status: 'PAUSED',
      };

      const updated = { id: 'connector-uuid', ...dto };
      prisma.connectorConfig.update.mockResolvedValue(updated);

      const result = await service.update('connector-uuid', dto);

      expect(prisma.connectorConfig.update).toHaveBeenCalledWith({
        where: { id: 'connector-uuid' },
        data: {
          name: 'Updated Name',
          status: 'PAUSED',
        },
      });
      expect(result).toEqual(updated);
    });

    it('should encrypt and update credentials when no values are masked', async () => {
      const dto: UpdateConnectorDto = {
        credentials: { token: 'ghp_new_token', secret: 'new_secret' },
      };

      const updated = { id: 'connector-uuid' };
      prisma.connectorConfig.update.mockResolvedValue(updated);

      await service.update('connector-uuid', dto);

      expect(cryptoService.encryptJSON).toHaveBeenCalledWith({
        token: 'ghp_new_token',
        secret: 'new_secret',
      });
      expect(prisma.connectorConfig.update).toHaveBeenCalledWith({
        where: { id: 'connector-uuid' },
        data: expect.objectContaining({
          credentials: expect.any(String),
        }),
      });
    });

    it('should skip credential update entirely when all values are masked (***)', async () => {
      const dto: UpdateConnectorDto = {
        name: 'Updated Name',
        credentials: { token: '***', secret: '***' },
      };

      const updated = { id: 'connector-uuid', name: 'Updated Name' };
      prisma.connectorConfig.update.mockResolvedValue(updated);

      await service.update('connector-uuid', dto);

      expect(cryptoService.encryptJSON).not.toHaveBeenCalled();
      expect(prisma.connectorConfig.update).toHaveBeenCalledWith({
        where: { id: 'connector-uuid' },
        data: {
          name: 'Updated Name',
        },
      });
      // credentials key should not exist in data at all
      const callData = prisma.connectorConfig.update.mock.calls[0][0].data;
      expect(callData).not.toHaveProperty('credentials');
    });

    it('should merge masked and real credentials when partially masked', async () => {
      const dto: UpdateConnectorDto = {
        credentials: { token: '***', secret: 'new_secret_value' },
      };

      const existingEncrypted = JSON.stringify({
        token: 'existing_token',
        secret: 'old_secret',
      });
      prisma.connectorConfig.findUnique.mockResolvedValue({
        credentials: existingEncrypted,
      });
      prisma.connectorConfig.update.mockResolvedValue({ id: 'connector-uuid' });

      await service.update('connector-uuid', dto);

      // Should fetch existing credentials for merge
      expect(prisma.connectorConfig.findUnique).toHaveBeenCalledWith({
        where: { id: 'connector-uuid' },
        select: { credentials: true },
      });

      // Should decrypt existing credentials
      expect(cryptoService.decryptJSON).toHaveBeenCalledWith(existingEncrypted);

      // Should encrypt merged result: existing token + new secret
      expect(cryptoService.encryptJSON).toHaveBeenCalledWith({
        token: 'existing_token',
        secret: 'new_secret_value',
      });
    });

    it('should handle partial mask when existing connector has no credentials', async () => {
      const dto: UpdateConnectorDto = {
        credentials: { token: '***', newField: 'value' },
      };

      prisma.connectorConfig.findUnique.mockResolvedValue({
        credentials: null,
      });
      prisma.connectorConfig.update.mockResolvedValue({ id: 'connector-uuid' });

      await service.update('connector-uuid', dto);

      // Masked value for non-existent key should be undefined
      expect(cryptoService.encryptJSON).toHaveBeenCalledWith({
        token: undefined,
        newField: 'value',
      });
    });
  });

  describe('delete', () => {
    it('should delete a connector by id', async () => {
      const deleted = { id: 'connector-uuid' };
      prisma.connectorConfig.delete.mockResolvedValue(deleted);

      const result = await service.delete('connector-uuid');

      expect(prisma.connectorConfig.delete).toHaveBeenCalledWith({
        where: { id: 'connector-uuid' },
      });
      expect(result).toEqual(deleted);
    });
  });

  describe('updateSyncStatus', () => {
    it('should update lastSyncAt, status, and clear error', async () => {
      const updated = {
        id: 'connector-uuid',
        status: 'ACTIVE',
        lastSyncAt: expect.any(Date),
        lastSyncError: null,
      };
      prisma.connectorConfig.update.mockResolvedValue(updated);

      const result = await service.updateSyncStatus('connector-uuid', 'ACTIVE');

      expect(prisma.connectorConfig.update).toHaveBeenCalledWith({
        where: { id: 'connector-uuid' },
        data: {
          status: 'ACTIVE',
          lastSyncAt: expect.any(Date),
          lastSyncError: null,
        },
      });
      expect(result).toEqual(updated);
    });

    it('should update with error message when provided', async () => {
      const updated = {
        id: 'connector-uuid',
        status: 'ERROR',
        lastSyncError: 'Connection refused',
      };
      prisma.connectorConfig.update.mockResolvedValue(updated);

      const result = await service.updateSyncStatus(
        'connector-uuid',
        'ERROR',
        'Connection refused',
      );

      expect(prisma.connectorConfig.update).toHaveBeenCalledWith({
        where: { id: 'connector-uuid' },
        data: {
          status: 'ERROR',
          lastSyncAt: expect.any(Date),
          lastSyncError: 'Connection refused',
        },
      });
      expect(result).toEqual(updated);
    });
  });

  describe('getActiveConnectors', () => {
    it('should return all connectors with status ACTIVE', async () => {
      const active = [
        { id: 'c1', status: 'ACTIVE' },
        { id: 'c2', status: 'ACTIVE' },
      ];
      prisma.connectorConfig.findMany.mockResolvedValue(active);

      const result = await service.getActiveConnectors();

      expect(prisma.connectorConfig.findMany).toHaveBeenCalledWith({
        where: { status: 'ACTIVE' },
      });
      expect(result).toEqual(active);
    });
  });
});
