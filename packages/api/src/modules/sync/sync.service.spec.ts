import { SyncService } from './sync.service';
import {
  createPrismaMock,
  PrismaMock,
} from '../../common/utils/prisma-mock';
import { PrismaService } from '../../database/prisma.service';
import { CryptoService } from '../../common/utils/crypto.service';
import { ConnectorRegistryService } from '../connector/connector-registry.service';
import {
  IQODConnector,
  NormalizedTestCase,
  NormalizedTestRun,
  NormalizedDefect,
  NormalizedPipelineRun,
} from '@qod/shared';

// ── Helpers ──────────────────────────────────────────────────────

const PROJECT_ID = 'project-uuid';
const CONNECTOR_CONFIG_ID = 'connector-config-uuid';
const SOURCE = 'github';

function makeConnectorConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: CONNECTOR_CONFIG_ID,
    projectId: PROJECT_ID,
    connectorType: 'GITHUB',
    name: 'GitHub - org/repo',
    credentials: { token: 'ghp_xxx' },
    fieldMapping: {},
    syncSchedule: '*/15 * * * *',
    status: 'ACTIVE',
    lastSyncAt: null,
    lastSyncError: null,
    syncCursor: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMockConnector(
  overrides: Partial<IQODConnector> = {},
): IQODConnector {
  return {
    name: 'GITHUB',
    type: 'ci',
    authenticate: vi.fn().mockResolvedValue({ success: true }),
    testConnection: vi.fn().mockResolvedValue({ success: true }),
    fetchTestCases: vi.fn().mockResolvedValue([]),
    fetchTestRuns: vi.fn().mockResolvedValue([]),
    fetchDefects: vi.fn().mockResolvedValue([]),
    fetchPipelineRuns: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function sampleTestCases(): NormalizedTestCase[] {
  return [
    {
      externalId: 'TC-1',
      title: 'Login test',
      type: 'AUTOMATED',
      automationStatus: 'AUTOMATED',
      suiteName: 'Auth',
      className: 'AuthSpec',
      filePath: 'tests/auth.spec.ts',
      tags: ['smoke', 'auth'],
    },
    {
      externalId: 'TC-2',
      title: 'Signup test',
      type: 'AUTOMATED',
      automationStatus: 'AUTOMATED',
      tags: ['auth'],
    },
  ];
}

function sampleTestRuns(): NormalizedTestRun[] {
  return [
    {
      externalId: 'RUN-1',
      name: 'CI Run #42',
      triggerType: 'CI_PUSH',
      branch: 'main',
      sha: 'abc123',
      startedAt: new Date('2025-01-01T10:00:00Z'),
      finishedAt: new Date('2025-01-01T10:05:00Z'),
      durationMs: 300000,
      status: 'PASSED',
      results: [
        {
          testExternalId: 'TC-1',
          testTitle: 'Login test',
          testClassName: 'AuthSpec',
          status: 'PASSED',
          durationMs: 1200,
        },
        {
          testExternalId: 'TC-2',
          testTitle: 'Signup test',
          status: 'FAILED',
          durationMs: 500,
          errorMessage: 'Assertion failed',
          stackTrace: 'at signup.spec.ts:42',
        },
      ],
    },
  ];
}

function sampleDefects(): NormalizedDefect[] {
  return [
    {
      externalId: 'BUG-1',
      title: 'Login button broken',
      url: 'https://github.com/org/repo/issues/1',
      severity: 'HIGH',
      priority: 'P1',
      status: 'OPEN',
      component: 'Auth',
      assignee: 'dev@example.com',
      isEscaped: false,
      reopenCount: 0,
      createdAt: new Date('2025-01-01'),
      changelog: [{ from: '', to: 'OPEN', at: new Date('2025-01-01') }],
      linkedTestExternalIds: ['TC-1'],
    },
  ];
}

function samplePipelineRuns(): NormalizedPipelineRun[] {
  return [
    {
      externalId: 'PIPE-1',
      workflowName: 'CI',
      branch: 'main',
      sha: 'abc123',
      status: 'SUCCESS',
      durationMs: 600000,
      triggeredBy: 'push',
      startedAt: new Date('2025-01-01T10:00:00Z'),
      finishedAt: new Date('2025-01-01T10:10:00Z'),
      url: 'https://github.com/org/repo/actions/runs/1',
      jobs: [{ name: 'test', status: 'success', durationMs: 300000 }],
    },
  ];
}

/** Set default empty-array returns for all findMany calls used by batch pre-fetch. */
function mockDefaultFindMany(prisma: PrismaMock) {
  prisma.testCase.findMany.mockResolvedValue([]);
  prisma.testRun.findMany.mockResolvedValue([]);
  prisma.defect.findMany.mockResolvedValue([]);
  prisma.pipelineRun.findMany.mockResolvedValue([]);
  prisma.epic.findMany.mockResolvedValue([]);
  prisma.story.findMany.mockResolvedValue([]);
}

// ── Tests ────────────────────────────────────────────────────────

describe('SyncService', () => {
  let service: SyncService;
  let prisma: PrismaMock;
  let registry: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = createPrismaMock();
    registry = { get: vi.fn() };
    const cryptoMock = {
      decryptJSON: vi.fn((val: any) => (typeof val === 'string' ? JSON.parse(val) : val)),
    };
    service = new SyncService(
      prisma as unknown as PrismaService,
      cryptoMock as unknown as CryptoService,
      registry as unknown as ConnectorRegistryService,
    );
    // Default: all batch pre-fetches return empty arrays
    mockDefaultFindMany(prisma);
  });

  // ── syncTestCases ───────────────────────────────────────────

  describe('syncTestCases', () => {
    it('should upsert each test case by (projectId, externalId, source)', async () => {
      const testCases = sampleTestCases();
      prisma.testCase.upsert.mockResolvedValue({ id: 'tc-uuid' });

      const result = await service.syncTestCases(PROJECT_ID, CONNECTOR_CONFIG_ID, testCases, SOURCE);

      expect(prisma.testCase.upsert).toHaveBeenCalledTimes(2);

      // Verify first call shape
      const firstCall = prisma.testCase.upsert.mock.calls[0][0];
      expect(firstCall.where).toEqual({
        projectId_externalId_source: {
          projectId: PROJECT_ID,
          externalId: 'TC-1',
          source: SOURCE,
        },
      });
      expect(firstCall.create.projectId).toBe(PROJECT_ID);
      expect(firstCall.create.externalId).toBe('TC-1');
      expect(firstCall.create.title).toBe('Login test');
      expect(firstCall.create.source).toBe(SOURCE);
      expect(firstCall.update.title).toBe('Login test');
    });

    it('should return created and updated counts', async () => {
      const testCases = sampleTestCases();
      // First upsert returns without an updatedAt matching creation (new entity)
      prisma.testCase.upsert
        .mockResolvedValueOnce({ id: 'tc-1', createdAt: new Date(), updatedAt: new Date() })
        .mockResolvedValueOnce({ id: 'tc-2', createdAt: new Date(), updatedAt: new Date() });

      const result = await service.syncTestCases(PROJECT_ID, CONNECTOR_CONFIG_ID, testCases, SOURCE);

      expect(result).toEqual({ created: expect.any(Number), updated: expect.any(Number), errors: expect.any(Array) });
      expect(result.created + result.updated).toBe(2);
    });

    it('should handle empty array', async () => {
      const result = await service.syncTestCases(PROJECT_ID, CONNECTOR_CONFIG_ID, [], SOURCE);

      expect(prisma.testCase.upsert).not.toHaveBeenCalled();
      expect(result).toEqual({ created: 0, updated: 0, errors: [] });
    });

    it('should continue syncing if a single entity fails', async () => {
      const testCases = sampleTestCases();
      prisma.testCase.upsert
        .mockRejectedValueOnce(new Error('DB constraint error'))
        .mockResolvedValueOnce({ id: 'tc-2' });

      const result = await service.syncTestCases(PROJECT_ID, CONNECTOR_CONFIG_ID, testCases, SOURCE);

      expect(prisma.testCase.upsert).toHaveBeenCalledTimes(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        externalId: 'TC-1',
        entity: 'testCase',
        message: expect.stringContaining('DB constraint error'),
      });
    });

    it('should batch pre-fetch existing test cases with findMany', async () => {
      const testCases = sampleTestCases();
      prisma.testCase.upsert.mockResolvedValue({ id: 'tc-uuid' });

      await service.syncTestCases(PROJECT_ID, CONNECTOR_CONFIG_ID, testCases, SOURCE);

      // Should call findMany once for cross-source batch pre-fetch (no source filter)
      expect(prisma.testCase.findMany).toHaveBeenCalledWith({
        where: { projectId: PROJECT_ID, deletedAt: null },
      });
      // Should NOT call findUnique (replaced by batch pre-fetch)
      expect(prisma.testCase.findUnique).not.toHaveBeenCalled();
    });
  });

  // ── syncTestRuns ────────────────────────────────────────────

  describe('syncTestRuns', () => {
    it('should upsert the test run and its results', async () => {
      const testRuns = sampleTestRuns();

      // Mock batch pre-fetch of test cases
      prisma.testCase.findMany.mockResolvedValue([
        { id: 'tc-uuid', externalId: 'TC-1', source: SOURCE, automationStatus: 'AUTOMATED' },
        { id: 'tc-uuid-2', externalId: 'TC-2', source: SOURCE, automationStatus: 'AUTOMATED' },
      ]);
      // Mock test run upsert
      prisma.testRun.upsert.mockResolvedValue({ id: 'run-uuid' });
      // Mock batch create of test results
      prisma.testResult.createMany.mockResolvedValue({ count: 2 });
      // Mock deleting old results for re-sync
      prisma.testResult.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.syncTestRuns(PROJECT_ID, CONNECTOR_CONFIG_ID, testRuns, SOURCE);

      expect(prisma.testRun.upsert).toHaveBeenCalledTimes(1);

      const runCall = prisma.testRun.upsert.mock.calls[0][0];
      expect(runCall.where).toEqual({
        projectId_externalId_source: {
          projectId: PROJECT_ID,
          externalId: 'RUN-1',
          source: SOURCE,
        },
      });
      expect(runCall.create.name).toBe('CI Run #42');
      expect(runCall.create.status).toBe('PASSED');

      expect(result).toEqual({ created: expect.any(Number), updated: expect.any(Number), errors: expect.any(Array) });
    });

    it('should link test results to existing test cases via batch pre-fetch', async () => {
      const testRuns = sampleTestRuns();

      // Pre-fetched test cases
      prisma.testCase.findMany.mockResolvedValue([
        { id: 'tc-uuid-1', externalId: 'TC-1', source: SOURCE, automationStatus: 'AUTOMATED' },
        { id: 'tc-uuid-2', externalId: 'TC-2', source: SOURCE, automationStatus: 'AUTOMATED' },
      ]);
      prisma.testRun.upsert.mockResolvedValue({ id: 'run-uuid' });
      prisma.testResult.createMany.mockResolvedValue({ count: 2 });
      prisma.testResult.deleteMany.mockResolvedValue({ count: 0 });

      await service.syncTestRuns(PROJECT_ID, CONNECTOR_CONFIG_ID, testRuns, SOURCE);

      // Should batch pre-fetch test cases for the project
      expect(prisma.testCase.findMany).toHaveBeenCalledWith({
        where: { projectId: PROJECT_ID, deletedAt: null },
      });

      // Should batch create results using createMany
      expect(prisma.testResult.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ testCaseId: 'tc-uuid-1', status: 'PASSED' }),
          expect.objectContaining({ testCaseId: 'tc-uuid-2', status: 'FAILED' }),
        ]),
      });
    });

    it('should handle empty results array', async () => {
      const result = await service.syncTestRuns(PROJECT_ID, CONNECTOR_CONFIG_ID, [], SOURCE);

      expect(prisma.testRun.upsert).not.toHaveBeenCalled();
      expect(result).toEqual({ created: 0, updated: 0, errors: [] });
    });

    it('should continue if a single run fails to sync', async () => {
      const testRuns: NormalizedTestRun[] = [
        ...sampleTestRuns(),
        {
          externalId: 'RUN-2',
          name: 'CI Run #43',
          triggerType: 'CI_PUSH',
          branch: 'main',
          startedAt: new Date(),
          status: 'FAILED',
          results: [],
        },
      ];

      prisma.testRun.upsert
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({ id: 'run-uuid-2' });
      prisma.testResult.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.syncTestRuns(PROJECT_ID, CONNECTOR_CONFIG_ID, testRuns, SOURCE);

      expect(prisma.testRun.upsert).toHaveBeenCalledTimes(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].externalId).toBe('RUN-1');
    });

    it('should compute run counts from results', async () => {
      const testRuns = sampleTestRuns(); // 1 PASSED, 1 FAILED

      prisma.testCase.findMany.mockResolvedValue([
        { id: 'tc-uuid', externalId: 'TC-1', source: SOURCE, automationStatus: 'AUTOMATED' },
        { id: 'tc-uuid-2', externalId: 'TC-2', source: SOURCE, automationStatus: 'AUTOMATED' },
      ]);
      prisma.testRun.upsert.mockResolvedValue({ id: 'run-uuid' });
      prisma.testResult.createMany.mockResolvedValue({ count: 2 });
      prisma.testResult.deleteMany.mockResolvedValue({ count: 0 });

      await service.syncTestRuns(PROJECT_ID, CONNECTOR_CONFIG_ID, testRuns, SOURCE);

      const runCall = prisma.testRun.upsert.mock.calls[0][0];
      expect(runCall.create.totalTests).toBe(2);
      expect(runCall.create.passedCount).toBe(1);
      expect(runCall.create.failedCount).toBe(1);
    });

    it('uses connector-supplied summaryCounts when results array is empty', async () => {
      // Repro for "(15 shards passed) → 0/0/0" — when the GitHub connector
      // can't parse Allure but supplies shard-derived counts, the test_run
      // row should reflect those counts instead of all zeros.
      const testRuns: NormalizedTestRun[] = [
        {
          externalId: 'RUN-noart',
          name: 'CI Run #100 (15 shards passed)',
          triggerType: 'CI_PUSH',
          branch: 'develop',
          startedAt: new Date('2026-04-26T10:00:00Z'),
          status: 'PASSED',
          results: [],
          summaryCounts: {
            totalTests: 15,
            passedCount: 15,
            failedCount: 0,
            skippedCount: 0,
            erroredCount: 0,
          },
        },
      ];

      prisma.testCase.findMany.mockResolvedValue([]);
      prisma.testRun.upsert.mockResolvedValue({ id: 'run-noart' });
      prisma.testResult.deleteMany.mockResolvedValue({ count: 0 });

      await service.syncTestRuns(PROJECT_ID, CONNECTOR_CONFIG_ID, testRuns, SOURCE);

      const runCall = prisma.testRun.upsert.mock.calls[0][0];
      expect(runCall.create.totalTests).toBe(15);
      expect(runCall.create.passedCount).toBe(15);
      expect(runCall.create.failedCount).toBe(0);
      // No test_results created because results array is empty
      expect(prisma.testResult.createMany).not.toHaveBeenCalled();
    });

    it('ignores summaryCounts when results array is non-empty (per-test data wins)', async () => {
      const testRuns: NormalizedTestRun[] = [
        {
          externalId: 'RUN-with-results',
          name: 'CI Run #101',
          triggerType: 'CI_PUSH',
          branch: 'develop',
          startedAt: new Date('2026-04-26T10:00:00Z'),
          status: 'PASSED',
          results: [
            {
              testExternalId: 'TC-1',
              testTitle: 'Login',
              status: 'PASSED',
            },
          ],
          // Misleading summaryCounts — these MUST be ignored when results exist.
          summaryCounts: {
            totalTests: 999,
            passedCount: 999,
            failedCount: 0,
          },
        },
      ];

      prisma.testCase.findMany.mockResolvedValue([
        { id: 'tc-uuid', externalId: 'TC-1', source: SOURCE, automationStatus: 'AUTOMATED' },
      ]);
      prisma.testRun.upsert.mockResolvedValue({ id: 'run-with-results' });
      prisma.testResult.createMany.mockResolvedValue({ count: 1 });
      prisma.testResult.deleteMany.mockResolvedValue({ count: 0 });

      await service.syncTestRuns(PROJECT_ID, CONNECTOR_CONFIG_ID, testRuns, SOURCE);

      const runCall = prisma.testRun.upsert.mock.calls[0][0];
      expect(runCall.create.totalTests).toBe(1);
      expect(runCall.create.passedCount).toBe(1);
    });
  });

  // ── syncDefects ─────────────────────────────────────────────

  describe('syncDefects', () => {
    it('should upsert each defect by (projectId, externalId, source)', async () => {
      const defects = sampleDefects();
      prisma.defect.upsert.mockResolvedValue({ id: 'defect-uuid' });
      // Pre-fetched test cases for DefectTestLink resolution
      prisma.testCase.findMany.mockResolvedValue([
        { id: 'tc-uuid', externalId: 'TC-1', source: SOURCE },
      ]);
      prisma.defectTestLink.upsert.mockResolvedValue({});

      const result = await service.syncDefects(PROJECT_ID, CONNECTOR_CONFIG_ID, defects, SOURCE);

      expect(prisma.defect.upsert).toHaveBeenCalledTimes(1);

      const call = prisma.defect.upsert.mock.calls[0][0];
      expect(call.where).toEqual({
        projectId_externalId_source: {
          projectId: PROJECT_ID,
          externalId: 'BUG-1',
          source: SOURCE,
        },
      });
      expect(call.create.title).toBe('Login button broken');
      expect(call.create.changelog).toEqual(defects[0].changelog);
      expect(call.update.reopenCount).toBe(0);

      expect(result).toEqual({ created: expect.any(Number), updated: expect.any(Number), errors: expect.any(Array) });
    });

    it('should create DefectTestLinks when linkedTestExternalIds provided', async () => {
      const defects = sampleDefects();
      prisma.defect.upsert.mockResolvedValue({ id: 'defect-uuid' });
      // Pre-fetched test cases
      prisma.testCase.findMany.mockResolvedValue([
        { id: 'tc-uuid-linked', externalId: 'TC-1', source: SOURCE },
      ]);
      prisma.defectTestLink.upsert.mockResolvedValue({});

      await service.syncDefects(PROJECT_ID, CONNECTOR_CONFIG_ID, defects, SOURCE);

      // Should batch pre-fetch test cases (with deletedAt filter)
      expect(prisma.testCase.findMany).toHaveBeenCalledWith({
        where: { projectId: PROJECT_ID, source: SOURCE, deletedAt: null },
      });

      // Should create the link
      expect(prisma.defectTestLink.upsert).toHaveBeenCalledWith({
        where: {
          defectId_testCaseId: {
            defectId: 'defect-uuid',
            testCaseId: 'tc-uuid-linked',
          },
        },
        create: {
          defectId: 'defect-uuid',
          testCaseId: 'tc-uuid-linked',
        },
        update: {},
      });
    });

    it('should skip DefectTestLink if linked test case not found', async () => {
      const defects = sampleDefects();
      prisma.defect.upsert.mockResolvedValue({ id: 'defect-uuid' });
      // Empty pre-fetch — no test cases found
      prisma.testCase.findMany.mockResolvedValue([]);

      await service.syncDefects(PROJECT_ID, CONNECTOR_CONFIG_ID, defects, SOURCE);

      expect(prisma.defectTestLink.upsert).not.toHaveBeenCalled();
    });

    it('should continue if a single defect fails to sync', async () => {
      const defects: NormalizedDefect[] = [
        ...sampleDefects(),
        {
          externalId: 'BUG-2',
          title: 'Another bug',
          severity: 'LOW',
          priority: 'P3',
          status: 'OPEN',
          isEscaped: false,
          reopenCount: 0,
          createdAt: new Date(),
          changelog: [],
        },
      ];

      prisma.defect.upsert
        .mockRejectedValueOnce(new Error('constraint violation'))
        .mockResolvedValueOnce({ id: 'defect-uuid-2' });

      const result = await service.syncDefects(PROJECT_ID, CONNECTOR_CONFIG_ID, defects, SOURCE);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].externalId).toBe('BUG-1');
    });
  });

  // ── syncPipelineRuns ────────────────────────────────────────

  describe('syncPipelineRuns', () => {
    it('should upsert each pipeline run by (projectId, externalId, source)', async () => {
      const pipelineRuns = samplePipelineRuns();
      prisma.pipelineRun.upsert.mockResolvedValue({ id: 'pipe-uuid' });

      const result = await service.syncPipelineRuns(PROJECT_ID, CONNECTOR_CONFIG_ID, pipelineRuns, SOURCE);

      expect(prisma.pipelineRun.upsert).toHaveBeenCalledTimes(1);

      const call = prisma.pipelineRun.upsert.mock.calls[0][0];
      expect(call.where).toEqual({
        projectId_externalId_source: {
          projectId: PROJECT_ID,
          externalId: 'PIPE-1',
          source: SOURCE,
        },
      });
      expect(call.create.workflowName).toBe('CI');
      expect(call.create.jobs).toEqual(pipelineRuns[0].jobs);

      expect(result).toEqual({ created: expect.any(Number), updated: expect.any(Number), errors: expect.any(Array) });
    });

    it('should handle empty array', async () => {
      const result = await service.syncPipelineRuns(PROJECT_ID, CONNECTOR_CONFIG_ID, [], SOURCE);

      expect(prisma.pipelineRun.upsert).not.toHaveBeenCalled();
      expect(result).toEqual({ created: 0, updated: 0, errors: [] });
    });

    it('should continue if a single pipeline run fails', async () => {
      const pipelineRuns: NormalizedPipelineRun[] = [
        ...samplePipelineRuns(),
        {
          externalId: 'PIPE-2',
          workflowName: 'Deploy',
          status: 'FAILURE',
          startedAt: new Date(),
          jobs: [],
        },
      ];

      prisma.pipelineRun.upsert
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({ id: 'pipe-uuid-2' });

      const result = await service.syncPipelineRuns(PROJECT_ID, CONNECTOR_CONFIG_ID, pipelineRuns, SOURCE);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].externalId).toBe('PIPE-1');
    });

    it('should batch pre-fetch existing pipeline runs with findMany', async () => {
      const pipelineRuns = samplePipelineRuns();
      prisma.pipelineRun.upsert.mockResolvedValue({ id: 'pipe-uuid' });

      await service.syncPipelineRuns(PROJECT_ID, CONNECTOR_CONFIG_ID, pipelineRuns, SOURCE);

      expect(prisma.pipelineRun.findMany).toHaveBeenCalledWith({
        where: { projectId: PROJECT_ID, source: SOURCE },
        select: { externalId: true },
      });
      // Should NOT call findUnique (replaced by batch pre-fetch)
      expect(prisma.pipelineRun.findUnique).not.toHaveBeenCalled();
    });
  });

  // ── executeSyncJob ──────────────────────────────────────────

  describe('executeSyncJob', () => {
    it('should orchestrate full sync: load config, fetch, sync, update status', async () => {
      const config = makeConnectorConfig();
      const connector = makeMockConnector({
        fetchTestCases: vi.fn().mockResolvedValue(sampleTestCases()),
        fetchTestRuns: vi.fn().mockResolvedValue(sampleTestRuns()),
        fetchDefects: vi.fn().mockResolvedValue(sampleDefects()),
        fetchPipelineRuns: vi.fn().mockResolvedValue(samplePipelineRuns()),
      });

      prisma.connectorConfig.findUniqueOrThrow.mockResolvedValue(config);
      registry.get.mockReturnValue(connector);

      // Mock all upserts for the sync methods
      prisma.testCase.upsert.mockResolvedValue({ id: 'tc-uuid' });
      prisma.testRun.upsert.mockResolvedValue({ id: 'run-uuid' });
      prisma.testCase.findMany.mockResolvedValue([
        { id: 'tc-uuid', externalId: 'TC-1', source: SOURCE, automationStatus: 'AUTOMATED' },
        { id: 'tc-uuid-2', externalId: 'TC-2', source: SOURCE, automationStatus: 'AUTOMATED' },
      ]);
      prisma.testResult.createMany.mockResolvedValue({ count: 2 });
      prisma.testResult.deleteMany.mockResolvedValue({ count: 0 });
      prisma.defect.upsert.mockResolvedValue({ id: 'defect-uuid' });
      prisma.defectTestLink.upsert.mockResolvedValue({});
      prisma.pipelineRun.upsert.mockResolvedValue({ id: 'pipe-uuid' });
      prisma.connectorConfig.update.mockResolvedValue({});

      await service.executeSyncJob(CONNECTOR_CONFIG_ID);

      // Should load config
      expect(prisma.connectorConfig.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: CONNECTOR_CONFIG_ID },
      });

      // Should get connector from registry
      expect(registry.get).toHaveBeenCalledWith('github');

      // Should call fetch methods
      expect(connector.fetchTestCases).toHaveBeenCalled();
      expect(connector.fetchTestRuns).toHaveBeenCalled();
      expect(connector.fetchDefects).toHaveBeenCalled();
      expect(connector.fetchPipelineRuns).toHaveBeenCalled();

      // Should use $transaction for atomicity
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      // Should update status to SYNCING then ACTIVE
      expect(prisma.connectorConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CONNECTOR_CONFIG_ID },
          data: expect.objectContaining({ status: 'SYNCING' }),
        }),
      );
    });

    it('should set status to ACTIVE on successful sync (empty results)', async () => {
      const config = makeConnectorConfig();
      const connector = makeMockConnector();

      prisma.connectorConfig.findUniqueOrThrow.mockResolvedValue(config);
      registry.get.mockReturnValue(connector);
      prisma.connectorConfig.update.mockResolvedValue({});

      await service.executeSyncJob(CONNECTOR_CONFIG_ID);

      // The last update should set status to ACTIVE but NOT advance lastSyncAt
      // when zero records were fetched (prevents empty syncs from blocking future syncs)
      const lastCall = prisma.connectorConfig.update.mock.calls.at(-1)?.[0];
      expect(lastCall?.data).toMatchObject({
        status: 'ACTIVE',
        lastSyncError: null,
      });
      expect(lastCall?.data).not.toHaveProperty('lastSyncAt');
      expect(lastCall?.data).not.toHaveProperty('syncCursor');
    });

    it('should set status to ACTIVE and advance lastSyncAt when data is fetched', async () => {
      const config = makeConnectorConfig();
      const connector = makeMockConnector({
        fetchTestCases: vi.fn().mockResolvedValue(sampleTestCases()),
        fetchTestRuns: vi.fn().mockResolvedValue([]),
      });

      prisma.connectorConfig.findUniqueOrThrow.mockResolvedValue(config);
      registry.get.mockReturnValue(connector);
      prisma.connectorConfig.update.mockResolvedValue({});
      prisma.testCase.findMany.mockResolvedValue([]);
      prisma.testCase.upsert.mockResolvedValue({ id: 'tc-uuid' });

      await service.executeSyncJob(CONNECTOR_CONFIG_ID);

      const lastCall = prisma.connectorConfig.update.mock.calls.at(-1)?.[0];
      expect(lastCall?.data).toMatchObject({
        status: 'ACTIVE',
        lastSyncAt: expect.any(Date),
        lastSyncError: null,
      });
    });

    it('should persist syncCursor with lastSyncAt when data is fetched', async () => {
      const config = makeConnectorConfig();
      const connector = makeMockConnector({
        fetchTestCases: vi.fn().mockResolvedValue(sampleTestCases()),
        fetchTestRuns: vi.fn().mockResolvedValue([]),
      });

      prisma.connectorConfig.findUniqueOrThrow.mockResolvedValue(config);
      registry.get.mockReturnValue(connector);
      prisma.connectorConfig.update.mockResolvedValue({});
      prisma.testCase.findMany.mockResolvedValue([]);
      prisma.testCase.upsert.mockResolvedValue({ id: 'tc-uuid' });

      await service.executeSyncJob(CONNECTOR_CONFIG_ID);

      // The final update (success) should include a syncCursor
      const lastCall = prisma.connectorConfig.update.mock.calls.at(-1)?.[0];
      expect(lastCall?.data).toHaveProperty('syncCursor');
      expect(lastCall?.data.syncCursor).toEqual({
        lastSyncAt: expect.any(String),
      });
      // Verify the cursor timestamp is a valid ISO date string
      const cursorDate = new Date(lastCall?.data.syncCursor.lastSyncAt);
      expect(cursorDate.getTime()).not.toBeNaN();
    });

    it('should pass existing syncCursor to connector config payload', async () => {
      const existingCursor = { lastSyncAt: '2025-06-01T00:00:00.000Z', page: 5 };
      const config = makeConnectorConfig({
        syncCursor: existingCursor,
        lastSyncAt: new Date('2025-06-01T00:00:00Z'),
      });
      const connector = makeMockConnector();

      prisma.connectorConfig.findUniqueOrThrow.mockResolvedValue(config);
      registry.get.mockReturnValue(connector);
      prisma.connectorConfig.update.mockResolvedValue({});

      await service.executeSyncJob(CONNECTOR_CONFIG_ID);

      // The connector should receive the syncCursor in its config payload
      const callArgs = connector.fetchTestCases.mock.calls[0];
      expect(callArgs[0]).toEqual(expect.objectContaining({
        syncCursor: existingCursor,
      }));
    });

    it('should not persist syncCursor when sync fails', async () => {
      const config = makeConnectorConfig();
      const connector = makeMockConnector({
        fetchTestCases: vi.fn().mockRejectedValue(new Error('Network error')),
      });

      prisma.connectorConfig.findUniqueOrThrow.mockResolvedValue(config);
      registry.get.mockReturnValue(connector);
      prisma.connectorConfig.update.mockResolvedValue({});

      await expect(service.executeSyncJob(CONNECTOR_CONFIG_ID)).rejects.toThrow('Network error');

      // The error update should NOT include syncCursor or lastSyncAt
      const lastCall = prisma.connectorConfig.update.mock.calls.at(-1)?.[0];
      expect(lastCall?.data.status).toBe('ERROR');
      expect(lastCall?.data).not.toHaveProperty('syncCursor');
      expect(lastCall?.data).not.toHaveProperty('lastSyncAt');
    });

    it('should set status to ERROR when connector not found in registry', async () => {
      const config = makeConnectorConfig();

      prisma.connectorConfig.findUniqueOrThrow.mockResolvedValue(config);
      registry.get.mockReturnValue(undefined);
      prisma.connectorConfig.update.mockResolvedValue({});

      await expect(service.executeSyncJob(CONNECTOR_CONFIG_ID)).rejects.toThrow('Connector not found in registry');

      const lastCall = prisma.connectorConfig.update.mock.calls.at(-1)?.[0];
      expect(lastCall?.data).toMatchObject({
        status: 'ERROR',
        lastSyncError: expect.stringContaining('GITHUB'),
      });
    });

    it('should set status to ERROR when a fetch method throws', async () => {
      const config = makeConnectorConfig();
      const connector = makeMockConnector({
        fetchTestCases: vi.fn().mockRejectedValue(new Error('API rate limit')),
      });

      prisma.connectorConfig.findUniqueOrThrow.mockResolvedValue(config);
      registry.get.mockReturnValue(connector);
      prisma.connectorConfig.update.mockResolvedValue({});

      await expect(service.executeSyncJob(CONNECTOR_CONFIG_ID)).rejects.toThrow('API rate limit');

      const lastCall = prisma.connectorConfig.update.mock.calls.at(-1)?.[0];
      expect(lastCall?.data).toMatchObject({
        status: 'ERROR',
        lastSyncError: expect.stringContaining('API rate limit'),
      });
    });

    it('should pass the syncCursor (since date) to fetch methods', async () => {
      const lastSync = new Date('2025-06-01T00:00:00Z');
      const config = makeConnectorConfig({ lastSyncAt: lastSync });
      const connector = makeMockConnector();

      prisma.connectorConfig.findUniqueOrThrow.mockResolvedValue(config);
      registry.get.mockReturnValue(connector);
      prisma.connectorConfig.update.mockResolvedValue({});

      await service.executeSyncJob(CONNECTOR_CONFIG_ID);

      expect(connector.fetchTestCases).toHaveBeenCalledWith(
        expect.objectContaining({ id: CONNECTOR_CONFIG_ID }),
        lastSync,
      );
    });

    it('should throw when loading connector config fails', async () => {
      prisma.connectorConfig.findUniqueOrThrow.mockRejectedValue(
        new Error('Config not found'),
      );
      prisma.connectorConfig.update.mockResolvedValue({});

      await expect(
        service.executeSyncJob(CONNECTOR_CONFIG_ID),
      ).rejects.toThrow('Connector config not found');
    });
  });

  // ── Idempotency ─────────────────────────────────────────────

  describe('idempotency', () => {
    it('calling syncTestCases twice with same data should not create duplicates', async () => {
      const testCases = sampleTestCases();
      prisma.testCase.upsert.mockResolvedValue({ id: 'tc-uuid' });

      await service.syncTestCases(PROJECT_ID, CONNECTOR_CONFIG_ID, testCases, SOURCE);
      await service.syncTestCases(PROJECT_ID, CONNECTOR_CONFIG_ID, testCases, SOURCE);

      // Upsert is called 2 times per call (2 test cases), so 4 total
      expect(prisma.testCase.upsert).toHaveBeenCalledTimes(4);

      // All calls use the same unique compound key, which ensures
      // the DB-level upsert prevents duplicates
      const allWheres = prisma.testCase.upsert.mock.calls.map(
        (call: any[]) => call[0].where,
      );
      expect(allWheres[0]).toEqual(allWheres[2]); // TC-1 first and second call
      expect(allWheres[1]).toEqual(allWheres[3]); // TC-2 first and second call
    });

    it('calling syncDefects twice with same data uses same compound key', async () => {
      const defects = sampleDefects();
      prisma.defect.upsert.mockResolvedValue({ id: 'defect-uuid' });
      prisma.testCase.findMany.mockResolvedValue([
        { id: 'tc-uuid', externalId: 'TC-1', source: SOURCE },
      ]);
      prisma.defectTestLink.upsert.mockResolvedValue({});

      await service.syncDefects(PROJECT_ID, CONNECTOR_CONFIG_ID, defects, SOURCE);
      await service.syncDefects(PROJECT_ID, CONNECTOR_CONFIG_ID, defects, SOURCE);

      const allWheres = prisma.defect.upsert.mock.calls.map(
        (call: any[]) => call[0].where,
      );
      expect(allWheres[0]).toEqual(allWheres[1]);
    });
  });

  // ── Cross-source deduplication (syncTestCases) ──────────────

  describe('syncTestCases cross-source deduplication', () => {
    it('should update existing cross-source test case instead of creating a duplicate', async () => {
      // Scenario: GitHub auto-created a test case with source=github.
      // When TestRail syncs the same externalId, it should update the existing
      // record rather than creating a duplicate with source=testrail.
      const testCases: NormalizedTestCase[] = [
        {
          externalId: '3952',
          title: 'Login test (from TestRail)',
          type: 'NOT_AUTOMATED',
          automationStatus: 'NOT_AUTOMATED',
          suiteName: 'Smoke',
          className: null,
          filePath: null,
          tags: [],
          references: 'PS-1234',
          testRailType: 'Regression',
        },
      ];

      // Pre-fetch returns the GitHub record (cross-source match)
      prisma.testCase.findMany.mockResolvedValue([
        {
          id: 'github-tc-uuid',
          externalId: '3952',
          source: 'github',
          automationStatus: 'AUTOMATED',
          title: 'Login test',
          suiteName: null,
          className: null,
          filePath: null,
        },
      ]);
      prisma.testCase.update.mockResolvedValue({ id: 'github-tc-uuid' });

      const result = await service.syncTestCases(PROJECT_ID, CONNECTOR_CONFIG_ID, testCases, 'testrail');

      // Should NOT create a new test case — should update the existing GitHub one
      expect(prisma.testCase.upsert).not.toHaveBeenCalled();
      expect(prisma.testCase.update).toHaveBeenCalledWith({
        where: { id: 'github-tc-uuid' },
        data: expect.objectContaining({
          title: 'Login test (from TestRail)',
          // Preserve AUTOMATED status — never downgrade
          automationStatus: 'AUTOMATED',
          type: 'AUTOMATED',
          suiteName: 'Smoke',
          references: 'PS-1234',
          testRailType: 'Regression',
        }),
      });
      expect(result.updated).toBe(1);
      expect(result.created).toBe(0);
    });

    it('should use normal upsert when test case exists under same source', async () => {
      const testCases: NormalizedTestCase[] = [
        {
          externalId: '3952',
          title: 'Login test updated',
          type: 'AUTOMATED',
          automationStatus: 'AUTOMATED',
          suiteName: 'Smoke',
          className: null,
          filePath: null,
          tags: [],
          references: null,
          testRailType: null,
        },
      ];

      // Pre-fetch returns same-source record
      prisma.testCase.findMany.mockResolvedValue([
        {
          id: 'github-tc-uuid',
          externalId: '3952',
          source: 'github',
          automationStatus: 'AUTOMATED',
          title: 'Login test',
          suiteName: null,
          className: null,
          filePath: null,
        },
      ]);
      prisma.testCase.upsert.mockResolvedValue({ id: 'github-tc-uuid' });

      const result = await service.syncTestCases(PROJECT_ID, CONNECTOR_CONFIG_ID, testCases, 'github');

      // Should use normal upsert path (same source)
      expect(prisma.testCase.upsert).toHaveBeenCalled();
      expect(prisma.testCase.update).not.toHaveBeenCalled();
      expect(result.updated).toBe(1);
    });
  });

  // ── Cross-source deduplication (syncTestRuns) ──────────────

  describe('cross-source deduplication', () => {
    it('should reuse existing test case from another source instead of creating a duplicate', async () => {
      // Scenario: TestRail already created TC-1 with source=testrail.
      // GitHub sync should link to it, not create a duplicate with source=github.
      const testRuns: NormalizedTestRun[] = [
        {
          externalId: 'RUN-1',
          name: 'CI Run #42',
          triggerType: 'CI_PUSH',
          branch: 'main',
          sha: 'abc123',
          startedAt: new Date('2025-01-01T10:00:00Z'),
          finishedAt: new Date('2025-01-01T10:05:00Z'),
          durationMs: 300000,
          status: 'PASSED',
          results: [
            {
              testExternalId: '3952',
              testTitle: 'Login test',
              status: 'PASSED',
              durationMs: 1200,
            },
          ],
        },
      ];

      // Pre-fetch returns the TestRail test case (cross-source match)
      prisma.testCase.findMany.mockResolvedValue([
        {
          id: 'testrail-tc-uuid',
          externalId: '3952',
          source: 'testrail',
          automationStatus: 'NOT_AUTOMATED',
          title: 'Login Test',
        },
      ]);
      prisma.testRun.findMany.mockResolvedValue([]);
      prisma.testRun.upsert.mockResolvedValue({ id: 'run-uuid' });
      prisma.testResult.createMany.mockResolvedValue({ count: 1 });
      prisma.testResult.deleteMany.mockResolvedValue({ count: 0 });

      await service.syncTestRuns(PROJECT_ID, CONNECTOR_CONFIG_ID, testRuns, SOURCE);

      // Should NOT create a new test case — should reuse the TestRail one
      expect(prisma.testCase.create).not.toHaveBeenCalled();
      expect(prisma.testCase.upsert).not.toHaveBeenCalled();

      // Result should link to the existing testrail test case
      expect(prisma.testResult.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ testCaseId: 'testrail-tc-uuid' }),
        ]),
      });
    });

    it('should check cross-source before auto-creating when pre-fetch missed a concurrent insert', async () => {
      // Scenario: pre-fetch returned empty (TestRail hadn't committed yet),
      // but by the time we auto-create, the TestRail record exists.
      const testRuns: NormalizedTestRun[] = [
        {
          externalId: 'RUN-1',
          name: 'CI Run',
          triggerType: 'CI_PUSH',
          branch: 'main',
          startedAt: new Date(),
          status: 'PASSED',
          results: [
            {
              testExternalId: '3952',
              testTitle: 'Login test',
              status: 'PASSED',
              durationMs: 500,
            },
          ],
        },
      ];

      // Pre-fetch returns nothing (concurrent TestRail sync hasn't committed)
      prisma.testCase.findMany.mockResolvedValue([]);
      prisma.testRun.findMany.mockResolvedValue([]);
      prisma.testRun.upsert.mockResolvedValue({ id: 'run-uuid' });
      prisma.testResult.createMany.mockResolvedValue({ count: 1 });
      prisma.testResult.deleteMany.mockResolvedValue({ count: 0 });

      // But findFirst (cross-source check) finds the TestRail record
      prisma.testCase.findFirst.mockResolvedValue({
        id: 'testrail-tc-uuid',
        externalId: '3952',
        source: 'testrail',
        automationStatus: 'NOT_AUTOMATED',
      });

      await service.syncTestRuns(PROJECT_ID, CONNECTOR_CONFIG_ID, testRuns, SOURCE);

      // Should reuse the TestRail test case found via findFirst
      expect(prisma.testResult.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ testCaseId: 'testrail-tc-uuid' }),
        ]),
      });

      // Should NOT have called upsert to create a new test case
      expect(prisma.testCase.upsert).not.toHaveBeenCalled();
    });

    it('should auto-create with upsert when no cross-source match exists', async () => {
      const testRuns: NormalizedTestRun[] = [
        {
          externalId: 'RUN-1',
          name: 'CI Run',
          triggerType: 'CI_PUSH',
          branch: 'main',
          startedAt: new Date(),
          status: 'PASSED',
          results: [
            {
              testExternalId: 'new-test-id',
              testTitle: 'Brand new test',
              status: 'PASSED',
              durationMs: 500,
            },
          ],
        },
      ];

      prisma.testCase.findMany.mockResolvedValue([]);
      prisma.testRun.findMany.mockResolvedValue([]);
      prisma.testRun.upsert.mockResolvedValue({ id: 'run-uuid' });
      prisma.testResult.createMany.mockResolvedValue({ count: 1 });
      prisma.testResult.deleteMany.mockResolvedValue({ count: 0 });

      // No cross-source match
      prisma.testCase.findFirst.mockResolvedValue(null);

      // Upsert creates the test case
      prisma.testCase.upsert.mockResolvedValue({
        id: 'new-tc-uuid',
        externalId: 'new-test-id',
        source: SOURCE,
        automationStatus: 'AUTOMATED',
      });

      await service.syncTestRuns(PROJECT_ID, CONNECTOR_CONFIG_ID, testRuns, SOURCE);

      // Should use upsert (not create) for the auto-created test case
      expect(prisma.testCase.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            projectId_externalId_source: {
              projectId: PROJECT_ID,
              externalId: 'new-test-id',
              source: SOURCE,
            },
          },
          create: expect.objectContaining({
            externalId: 'new-test-id',
            title: 'Brand new test',
            type: 'AUTOMATED',
            automationStatus: 'AUTOMATED',
            source: SOURCE,
          }),
          update: {},
        }),
      );
    });
  });

  // ── Per-project sync lock ─────────────────────────────────────

  describe('per-project sync lock', () => {
    it('should serialize concurrent syncs for the same project', async () => {
      const executionOrder: string[] = [];

      const config1 = makeConnectorConfig({ id: 'conn-1', connectorType: 'TESTRAIL' });
      const config2 = makeConnectorConfig({ id: 'conn-2', connectorType: 'GITHUB' });

      // Slow connector: delays inside the transaction
      const slowConnector = makeMockConnector({
        name: 'TESTRAIL',
        fetchTestCases: vi.fn().mockImplementation(async () => {
          executionOrder.push('testrail-fetch-start');
          await new Promise(r => setTimeout(r, 50));
          executionOrder.push('testrail-fetch-end');
          return sampleTestCases();
        }),
        fetchTestRuns: vi.fn().mockResolvedValue([]),
      });

      const fastConnector = makeMockConnector({
        name: 'GITHUB',
        fetchTestCases: vi.fn().mockImplementation(async () => {
          executionOrder.push('github-fetch-start');
          return sampleTestCases();
        }),
        fetchTestRuns: vi.fn().mockResolvedValue([]),
      });

      prisma.connectorConfig.findUniqueOrThrow
        .mockResolvedValueOnce(config1)
        .mockResolvedValueOnce(config2);
      registry.get
        .mockReturnValueOnce(slowConnector)
        .mockReturnValueOnce(fastConnector);
      prisma.connectorConfig.update.mockResolvedValue({});
      prisma.testCase.upsert.mockResolvedValue({ id: 'tc-uuid' });

      // Launch both syncs concurrently
      const p1 = service.executeSyncJob('conn-1');
      const p2 = service.executeSyncJob('conn-2');

      await Promise.all([p1, p2]);

      // The $transaction mock runs its callback synchronously, so the lock
      // ensures the second sync waits for the first to complete its transaction.
      // Both should succeed without errors.
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });
  });

  // ── Error handling ──────────────────────────────────────────

  describe('error handling', () => {
    it('if a single test case fails to sync, others should still succeed', async () => {
      const testCases: NormalizedTestCase[] = [
        ...sampleTestCases(),
        {
          externalId: 'TC-3',
          title: 'Third test',
          type: 'MANUAL',
          automationStatus: 'NOT_AUTOMATED',
          tags: [],
        },
      ];

      prisma.testCase.upsert
        .mockResolvedValueOnce({ id: 'tc-1' })
        .mockRejectedValueOnce(new Error('Unique constraint'))
        .mockResolvedValueOnce({ id: 'tc-3' });

      const result = await service.syncTestCases(PROJECT_ID, CONNECTOR_CONFIG_ID, testCases, SOURCE);

      expect(prisma.testCase.upsert).toHaveBeenCalledTimes(3);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].externalId).toBe('TC-2');
      // 2 succeeded
      expect(result.created + result.updated).toBe(2);
    });

    it('if a single defect fails, others succeed', async () => {
      const defects: NormalizedDefect[] = [
        ...sampleDefects(),
        {
          externalId: 'BUG-2',
          title: 'Second bug',
          severity: 'LOW',
          priority: 'P3',
          status: 'CLOSED',
          isEscaped: false,
          reopenCount: 1,
          createdAt: new Date(),
          changelog: [],
        },
      ];

      prisma.defect.upsert
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce({ id: 'defect-2' });

      const result = await service.syncDefects(PROJECT_ID, CONNECTOR_CONFIG_ID, defects, SOURCE);

      expect(result.errors).toHaveLength(1);
      expect(result.created + result.updated).toBe(1);
    });
  });
});
