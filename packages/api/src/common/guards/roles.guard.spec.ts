import 'reflect-metadata';
import { RolesGuard } from './roles.guard';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;
  let prisma: { projectMember: { findFirst: ReturnType<typeof vi.fn> } };

  function createContext(
    params: Record<string, string> = {},
    user?: { userId: string; role: string },
    handlerRoles?: string[],
  ): ExecutionContext {
    const request = { params, user };
    const handler = () => ({});
    const cls = () => ({});

    // Set up reflector metadata for the handler
    if (handlerRoles) {
      Reflect.defineMetadata(ROLES_KEY, handlerRoles, handler);
    }

    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => cls,
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    reflector = new Reflector();
    prisma = { projectMember: { findFirst: vi.fn() } };
    guard = new RolesGuard(reflector, prisma as unknown as PrismaService);
  });

  it('should allow access when no roles are required', async () => {
    const ctx = createContext({}, { userId: 'u1', role: 'MEMBER' });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('should deny access when no user is present', async () => {
    const ctx = createContext({}, undefined, ['ADMIN']);
    expect(await guard.canActivate(ctx)).toBe(false);
  });

  it('should allow access when global role matches', async () => {
    const ctx = createContext({}, { userId: 'u1', role: 'ADMIN' }, ['ADMIN']);
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(prisma.projectMember.findFirst).not.toHaveBeenCalled();
  });

  it('should deny access when global role does not match and no projectId', async () => {
    const ctx = createContext({}, { userId: 'u1', role: 'MEMBER' }, ['ADMIN']);
    expect(await guard.canActivate(ctx)).toBe(false);
  });

  it('should fall through to project role check when global role does not match', async () => {
    prisma.projectMember.findFirst.mockResolvedValue({ role: 'MEMBER' });
    // Required: ['ADMIN', 'MEMBER'] — user global role is MEMBER which matches directly
    // So we test with required=['ADMIN'] to force project-level fallback
    const ctx = createContext(
      { projectId: 'p1' },
      { userId: 'u1', role: 'MEMBER' },
      ['ADMIN'],
    );
    // Should still deny because project role MEMBER doesn't match required ADMIN
    expect(await guard.canActivate(ctx)).toBe(false);
    expect(prisma.projectMember.findFirst).toHaveBeenCalledWith({
      where: { projectId: 'p1', userId: 'u1' },
      select: { role: true },
    });
  });

  it('should deny access when neither global nor project role matches', async () => {
    prisma.projectMember.findFirst.mockResolvedValue({ role: 'MEMBER' });
    const ctx = createContext(
      { projectId: 'p1' },
      { userId: 'u1', role: 'MEMBER' },
      ['ADMIN'],
    );
    expect(await guard.canActivate(ctx)).toBe(false);
  });

  it('should deny access when user has no project membership', async () => {
    prisma.projectMember.findFirst.mockResolvedValue(null);
    const ctx = createContext(
      { projectId: 'p1' },
      { userId: 'u1', role: 'MEMBER' },
      ['ADMIN'],
    );
    expect(await guard.canActivate(ctx)).toBe(false);
  });
});
