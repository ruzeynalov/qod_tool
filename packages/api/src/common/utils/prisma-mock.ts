import { vi } from 'vitest';

// Deep mock of PrismaClient for unit tests.
// Each model returns chainable query mocks.
function createModelMock() {
  return {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
    findFirstOrThrow: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  };
}

export function createPrismaMock() {
  const mock = {
    organization: createModelMock(),
    user: createModelMock(),
    project: createModelMock(),
    projectMember: createModelMock(),
    connectorConfig: createModelMock(),
    featureArea: createModelMock(),
    testCase: createModelMock(),
    testRun: createModelMock(),
    testResult: createModelMock(),
    defect: createModelMock(),
    defectTestLink: createModelMock(),
    pipelineRun: createModelMock(),
    kPISnapshot: createModelMock(),
    kPITarget: createModelMock(),
    alertRule: createModelMock(),
    dashboardLayout: createModelMock(),
    notification: createModelMock(),
    auditLog: createModelMock(),
    epic: createModelMock(),
    story: createModelMock(),
    $transaction: vi.fn(),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  };
  // $transaction supports both callback and array patterns
  mock.$transaction.mockImplementation((fnOrArray: any) => {
    if (typeof fnOrArray === 'function') return fnOrArray(mock);
    // Array of promises — resolve them all
    return Promise.all(fnOrArray);
  });
  return mock;
}

export type PrismaMock = ReturnType<typeof createPrismaMock>;
