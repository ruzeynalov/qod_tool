import { Reflector } from '@nestjs/core';
import { ConnectorController } from './connector.controller';
import { ConnectorService } from './connector.service';
import { ConnectorRegistryService } from './connector-registry.service';
import { SyncService } from '../sync/sync.service';
import { AggregationService } from '../aggregation/aggregation.service';
import { KPIService } from '../kpi/kpi.service';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

const PROJECT_ID = 'proj-uuid-1';
const CONNECTOR_ID = 'conn-uuid-1';

function createMockConnectorService() {
  const decryptedConnector = {
    id: CONNECTOR_ID,
    connectorType: 'github',
    credentials: { token: 'abc' },
    fieldMapping: {},
    syncSchedule: '0 * * * *',
    syncCursor: null,
  };
  return {
    findAll: vi.fn().mockResolvedValue([{
      id: CONNECTOR_ID,
      connectorType: 'github',
      name: 'GitHub Connector',
      fieldMapping: { repo: 'my-repo' },
      syncSchedule: '0 * * * *',
      syncTimezone: 'UTC',
    }]),
    findById: vi.fn().mockResolvedValue({
      id: CONNECTOR_ID,
      connectorType: 'github',
      credentials: 'encrypted-string',
      fieldMapping: {},
      syncSchedule: '0 * * * *',
      syncCursor: null,
    }),
    findByIdDecrypted: vi.fn().mockResolvedValue(decryptedConnector),
    create: vi.fn().mockResolvedValue({ id: CONNECTOR_ID }),
    update: vi.fn().mockResolvedValue({ id: CONNECTOR_ID }),
    delete: vi.fn().mockResolvedValue({ id: CONNECTOR_ID }),
  };
}

function createMockRegistryService() {
  return {
    get: vi.fn().mockReturnValue({
      testConnection: vi.fn().mockResolvedValue({ success: true }),
    }),
  };
}

function createMockSyncService() {
  return {
    executeSyncJob: vi.fn().mockResolvedValue({ logs: ['synced 10 items'] }),
  };
}

function createMockAggregationService() {
  return {
    runAggregation: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockKPIService() {
  return {
    invalidateCache: vi.fn(),
  };
}

describe('ConnectorController', () => {
  let controller: ConnectorController;
  let connectorService: ReturnType<typeof createMockConnectorService>;
  let registryService: ReturnType<typeof createMockRegistryService>;
  let syncService: ReturnType<typeof createMockSyncService>;
  let aggregationService: ReturnType<typeof createMockAggregationService>;
  let kpiService: ReturnType<typeof createMockKPIService>;

  beforeEach(() => {
    connectorService = createMockConnectorService();
    registryService = createMockRegistryService();
    syncService = createMockSyncService();
    aggregationService = createMockAggregationService();
    kpiService = createMockKPIService();

    controller = new ConnectorController(
      connectorService as unknown as ConnectorService,
      registryService as unknown as ConnectorRegistryService,
      syncService as unknown as SyncService,
      aggregationService as unknown as AggregationService,
      kpiService as unknown as KPIService,
    );
  });

  it('findAll passes projectId to service', async () => {
    const result = await controller.findAll(PROJECT_ID);
    expect(connectorService.findAll).toHaveBeenCalledWith(PROJECT_ID);
    expect(result).toHaveLength(1);
  });

  it('findById returns masked credentials', async () => {
    const result = await controller.findById(CONNECTOR_ID);
    expect(connectorService.findByIdDecrypted).toHaveBeenCalledWith(CONNECTOR_ID);
    expect(result).toEqual(expect.objectContaining({ id: CONNECTOR_ID, credentials: { token: '***' } }));
  });

  it('create passes projectId and dto to service', async () => {
    const dto = {
      connectorType: 'github',
      name: 'GitHub Connector',
      credentials: { token: 'ghp_abc' },
    };
    await controller.create(PROJECT_ID, dto);
    expect(connectorService.create).toHaveBeenCalledWith(PROJECT_ID, dto);
  });

  it('update passes id and dto to service', async () => {
    const dto = { name: 'Updated Connector' };
    await controller.update(PROJECT_ID, CONNECTOR_ID, dto);
    expect(connectorService.update).toHaveBeenCalledWith(CONNECTOR_ID, dto);
  });

  it('delete passes id to service', async () => {
    await controller.delete(CONNECTOR_ID);
    expect(connectorService.delete).toHaveBeenCalledWith(CONNECTOR_ID);
  });

  it('testConnection looks up connector and tests via registry', async () => {
    const result = await controller.testConnection(CONNECTOR_ID);

    expect(connectorService.findByIdDecrypted).toHaveBeenCalledWith(CONNECTOR_ID);
    expect(registryService.get).toHaveBeenCalledWith('github');
    expect(result).toEqual({ success: true });
  });

  it('testConnection throws when connector not found', async () => {
    connectorService.findByIdDecrypted.mockResolvedValueOnce(null);

    await expect(controller.testConnection(CONNECTOR_ID)).rejects.toThrow('Connector not found');
  });

  it('testConnection throws when no implementation exists', async () => {
    registryService.get.mockReturnValueOnce(undefined);

    await expect(controller.testConnection(CONNECTOR_ID)).rejects.toThrow(
      'No connector implementation for github',
    );
  });

  it('triggerSync executes sync and runs aggregation', async () => {
    const result = await controller.triggerSync(PROJECT_ID, CONNECTOR_ID);

    expect(syncService.executeSyncJob).toHaveBeenCalledWith(CONNECTOR_ID);
    expect(aggregationService.runAggregation).toHaveBeenCalledWith(PROJECT_ID);
    expect(result).toEqual({ success: true, logs: ['synced 10 items'] });
  });

  it('triggerSync throws on sync failure', async () => {
    syncService.executeSyncJob.mockRejectedValueOnce(new Error('Connection timeout'));

    await expect(controller.triggerSync(PROJECT_ID, CONNECTOR_ID)).rejects.toThrow('Connection timeout');
  });

  it('exportAll returns decrypted connector configs', async () => {
    const result = await controller.exportAll(PROJECT_ID);

    expect(connectorService.findAll).toHaveBeenCalledWith(PROJECT_ID);
    expect(connectorService.findByIdDecrypted).toHaveBeenCalledWith(CONNECTOR_ID);
    expect(result).toEqual([
      {
        connectorType: 'github',
        name: 'GitHub Connector',
        credentials: { token: 'abc' },
        fieldMapping: { repo: 'my-repo' },
        syncSchedule: '0 * * * *',
        syncTimezone: 'UTC',
      },
    ]);
  });

  it('exportAll requires ADMIN role', () => {
    const reflector = new Reflector();
    const roles = reflector.get<string[]>(
      ROLES_KEY,
      ConnectorController.prototype.exportAll,
    );
    expect(roles).toEqual(['ADMIN']);
  });
});
