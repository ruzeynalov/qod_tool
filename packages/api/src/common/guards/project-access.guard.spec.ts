import { ProjectAccessGuard } from './project-access.guard';
import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

describe('ProjectAccessGuard', () => {
  let guard: ProjectAccessGuard;
  let prisma: { project: { findUnique: ReturnType<typeof vi.fn> } };

  function createContext(
    params: Record<string, string> = {},
    user?: { userId: string; orgId: string; role: string },
  ): ExecutionContext {
    const request = { params, user };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    prisma = { project: { findUnique: vi.fn() } };
    guard = new ProjectAccessGuard(prisma as unknown as PrismaService);
  });

  it('should allow when no projectId in params', async () => {
    const ctx = createContext({}, { userId: 'u1', orgId: 'org1', role: 'MEMBER' });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('should throw NotFoundException when project does not exist', async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    const ctx = createContext({ projectId: 'missing' }, { userId: 'u1', orgId: 'org1', role: 'MEMBER' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
  });

  it('should allow ADMIN users regardless of orgId', async () => {
    prisma.project.findUnique.mockResolvedValue({ orgId: 'org-other' });
    const ctx = createContext({ projectId: 'p1' }, { userId: 'u1', orgId: 'org1', role: 'ADMIN' });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('should allow when user orgId matches project orgId', async () => {
    prisma.project.findUnique.mockResolvedValue({ orgId: 'org1' });
    const ctx = createContext({ projectId: 'p1' }, { userId: 'u1', orgId: 'org1', role: 'MEMBER' });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('should throw ForbiddenException when orgId does not match', async () => {
    prisma.project.findUnique.mockResolvedValue({ orgId: 'org-other' });
    const ctx = createContext({ projectId: 'p1' }, { userId: 'u1', orgId: 'org1', role: 'MEMBER' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('should allow when no user is attached (public route)', async () => {
    prisma.project.findUnique.mockResolvedValue({ orgId: 'org1' });
    const ctx = createContext({ projectId: 'p1' });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('should query project with only orgId selected', async () => {
    prisma.project.findUnique.mockResolvedValue({ orgId: 'org1' });
    const ctx = createContext({ projectId: 'p1' }, { userId: 'u1', orgId: 'org1', role: 'MEMBER' });
    await guard.canActivate(ctx);
    expect(prisma.project.findUnique).toHaveBeenCalledWith({
      where: { id: 'p1' },
      select: { orgId: true },
    });
  });
});
