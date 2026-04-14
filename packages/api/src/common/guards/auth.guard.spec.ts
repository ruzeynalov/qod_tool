import { AuthGuard } from './auth.guard';
import { AuthService } from '../../modules/auth/auth.service';
import { PrismaService } from '../../database/prisma.service';
import { Reflector } from '@nestjs/core';
import { UnauthorizedException, ExecutionContext } from '@nestjs/common';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let authService: { verifyToken: ReturnType<typeof vi.fn> };
  let reflector: { getAllAndOverride: ReturnType<typeof vi.fn> };
  let prisma: { user: { findUnique: ReturnType<typeof vi.fn> } };

  function createMockContext(headers: Record<string, string> = {}): ExecutionContext {
    const request = { headers, user: undefined as any };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    authService = { verifyToken: vi.fn() };
    reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) };
    prisma = { user: { findUnique: vi.fn().mockResolvedValue({ blockedAt: null, role: 'MEMBER' }) } };
    guard = new AuthGuard(
      authService as unknown as AuthService,
      reflector as unknown as Reflector,
      prisma as unknown as PrismaService,
    );
  });

  it('should allow access when route is marked @Public()', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const context = createMockContext({});
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('should throw UnauthorizedException when no authorization header is present', async () => {
    const context = createMockContext({});
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(context)).rejects.toThrow('Missing authorization header');
  });

  it('should throw UnauthorizedException when authorization header has wrong format', async () => {
    const context = createMockContext({ authorization: 'Basic abc123' });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when token is invalid', async () => {
    authService.verifyToken.mockReturnValue(null);
    const context = createMockContext({ authorization: 'Bearer invalid-token' });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should return true and attach user to request when token is valid', async () => {
    const tokenPayload = { userId: 'u1', email: 'test@e.com', role: 'MEMBER', orgId: 'o1' };
    authService.verifyToken.mockReturnValue(tokenPayload);

    const request = { headers: { authorization: 'Bearer valid-token' }, user: undefined as any };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    expect(await guard.canActivate(context)).toBe(true);
    expect(request.user).toEqual(tokenPayload);
  });

  it('should call verifyToken with the extracted token', async () => {
    authService.verifyToken.mockReturnValue({ userId: 'u1', email: 'e@e.com', role: 'ADMIN', orgId: 'o1' });
    const context = createMockContext({ authorization: 'Bearer my-jwt-token' });
    await guard.canActivate(context);
    expect(authService.verifyToken).toHaveBeenCalledWith('my-jwt-token');
  });

  it('should throw UnauthorizedException when user is blocked', async () => {
    const tokenPayload = { userId: 'u1', email: 'test@e.com', role: 'MEMBER', orgId: 'o1' };
    authService.verifyToken.mockReturnValue(tokenPayload);
    prisma.user.findUnique.mockResolvedValue({ blockedAt: new Date('2026-01-01'), role: 'MEMBER' });

    const context = createMockContext({ authorization: 'Bearer valid-token' });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(context)).rejects.toThrow('Account is blocked');
  });

  it('should allow access when user is not blocked', async () => {
    const tokenPayload = { userId: 'u1', email: 'test@e.com', role: 'MEMBER', orgId: 'o1' };
    authService.verifyToken.mockReturnValue(tokenPayload);
    prisma.user.findUnique.mockResolvedValue({ blockedAt: null, role: 'MEMBER' });

    const request = { headers: { authorization: 'Bearer valid-token' }, user: undefined as any };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    expect(await guard.canActivate(context)).toBe(true);
  });
});
