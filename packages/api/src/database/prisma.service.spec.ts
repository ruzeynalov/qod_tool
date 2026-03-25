import { PrismaClient } from '@prisma/client';

// Mock PrismaClient so the test doesn't require a generated client
vi.mock('@prisma/client', () => {
  const PrismaClientMock = vi.fn();
  PrismaClientMock.prototype.$connect = vi.fn();
  PrismaClientMock.prototype.$disconnect = vi.fn();
  return { PrismaClient: PrismaClientMock };
});

import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(() => {
    service = new PrismaService();
  });

  it('should call $connect on module init', async () => {
    const connectSpy = vi
      .spyOn(service, '$connect')
      .mockResolvedValue(undefined);

    await service.onModuleInit();

    expect(connectSpy).toHaveBeenCalledOnce();
  });

  it('should call $disconnect on module destroy', async () => {
    const disconnectSpy = vi
      .spyOn(service, '$disconnect')
      .mockResolvedValue(undefined);

    await service.onModuleDestroy();

    expect(disconnectSpy).toHaveBeenCalledOnce();
  });
});
