import { AuditLogInterceptor, AUDIT_ACTION_KEY } from './audit-log.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service';
import { of } from 'rxjs';
import { lastValueFrom } from 'rxjs';

describe('AuditLogInterceptor', () => {
  let interceptor: AuditLogInterceptor;
  let prisma: { auditLog: { create: ReturnType<typeof vi.fn> } };
  let reflector: { get: ReturnType<typeof vi.fn> };

  function createContext(
    params: Record<string, string> = {},
    user?: { userId: string; orgId: string },
  ): ExecutionContext {
    const request = { params, user };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  function createCallHandler(result: any = {}): CallHandler {
    return { handle: () => of(result) };
  }

  beforeEach(() => {
    prisma = { auditLog: { create: vi.fn().mockResolvedValue({}) } };
    reflector = { get: vi.fn() };
    interceptor = new AuditLogInterceptor(
      prisma as unknown as PrismaService,
      reflector as unknown as Reflector,
    );
  });

  it('should pass through when no audit metadata is set', async () => {
    reflector.get.mockReturnValue(undefined);
    const ctx = createContext({}, { userId: 'u1', orgId: 'o1' });
    const result = await lastValueFrom(interceptor.intercept(ctx, createCallHandler({ ok: true })));
    expect(result).toEqual({ ok: true });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('should pass through when no user is attached', async () => {
    reflector.get.mockReturnValue({ action: 'test.action' });
    const ctx = createContext({});
    const result = await lastValueFrom(interceptor.intercept(ctx, createCallHandler({ ok: true })));
    expect(result).toEqual({ ok: true });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('should create audit log entry when metadata and user are present', async () => {
    reflector.get.mockReturnValue({ action: 'connector.created', entityType: 'ConnectorConfig' });
    const ctx = createContext(
      { projectId: 'p1', id: 'conn-1' },
      { userId: 'u1', orgId: 'o1' },
    );
    const responseData = { id: 'conn-1', name: 'Test' };

    await lastValueFrom(interceptor.intercept(ctx, createCallHandler(responseData)));

    // Give the tap async a tick to complete
    await new Promise((r) => setTimeout(r, 10));

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        projectId: 'p1',
        action: 'connector.created',
        entityType: 'ConnectorConfig',
        entityId: 'conn-1',
        newValue: responseData,
      },
    });
  });

  it('should not break the request if audit log creation fails', async () => {
    reflector.get.mockReturnValue({ action: 'test.action' });
    prisma.auditLog.create.mockRejectedValue(new Error('DB down'));
    const ctx = createContext({ projectId: 'p1' }, { userId: 'u1', orgId: 'o1' });

    const result = await lastValueFrom(interceptor.intercept(ctx, createCallHandler({ ok: true })));
    expect(result).toEqual({ ok: true });
  });

  it('should handle null projectId and entityId', async () => {
    reflector.get.mockReturnValue({ action: 'user.updated' });
    const ctx = createContext({}, { userId: 'u1', orgId: 'o1' });

    await lastValueFrom(interceptor.intercept(ctx, createCallHandler({ name: 'Updated' })));
    await new Promise((r) => setTimeout(r, 10));

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: null,
        entityId: null,
      }),
    });
  });
});
