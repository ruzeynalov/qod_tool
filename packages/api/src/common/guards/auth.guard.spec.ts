import { AuthGuard } from './auth.guard';
import { AuthService } from '../../modules/auth/auth.service';
import { Reflector } from '@nestjs/core';
import { UnauthorizedException, ExecutionContext } from '@nestjs/common';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let authService: { verifyToken: ReturnType<typeof vi.fn> };
  let reflector: { getAllAndOverride: ReturnType<typeof vi.fn> };

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
    guard = new AuthGuard(
      authService as unknown as AuthService,
      reflector as unknown as Reflector,
    );
  });

  it('should allow access when route is marked @Public()', () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const context = createMockContext({});
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw UnauthorizedException when no authorization header is present', () => {
    const context = createMockContext({});
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow('Missing authorization header');
  });

  it('should throw UnauthorizedException when authorization header has wrong format', () => {
    const context = createMockContext({ authorization: 'Basic abc123' });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when token is invalid', () => {
    authService.verifyToken.mockReturnValue(null);
    const context = createMockContext({ authorization: 'Bearer invalid-token' });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should return true and attach user to request when token is valid', () => {
    const tokenPayload = { userId: 'u1', email: 'test@e.com', role: 'MEMBER', orgId: 'o1' };
    authService.verifyToken.mockReturnValue(tokenPayload);

    const request = { headers: { authorization: 'Bearer valid-token' }, user: undefined as any };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
    expect(request.user).toEqual(tokenPayload);
  });

  it('should call verifyToken with the extracted token', () => {
    authService.verifyToken.mockReturnValue({ userId: 'u1', email: 'e@e.com', role: 'ADMIN', orgId: 'o1' });
    const context = createMockContext({ authorization: 'Bearer my-jwt-token' });
    guard.canActivate(context);
    expect(authService.verifyToken).toHaveBeenCalledWith('my-jwt-token');
  });
});
