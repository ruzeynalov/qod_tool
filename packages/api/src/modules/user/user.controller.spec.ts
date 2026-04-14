import { ForbiddenException } from '@nestjs/common';
import { UserController } from './user.controller';

const ORG_ID = 'org-uuid-1';
const USER_ID = 'user-uuid-1';

function createMockUserService() {
  return {
    findAll: vi.fn().mockResolvedValue([{ id: USER_ID, name: 'Alice' }]),
    findById: vi.fn().mockResolvedValue({ id: USER_ID, name: 'Alice' }),
    findByEmail: vi.fn().mockResolvedValue({ id: USER_ID, password: 'hashed-old-pw' }),
    update: vi.fn().mockResolvedValue({ id: USER_ID, name: 'Alice Updated' }),
    delete: vi.fn().mockResolvedValue({ id: USER_ID }),
    create: vi.fn().mockResolvedValue({
      id: 'new-user-id',
      email: 'new@example.com',
      name: 'New User',
      role: 'MEMBER',
      blockedAt: null,
    }),
    block: vi.fn().mockResolvedValue({ id: USER_ID, blockedAt: new Date() }),
    unblock: vi.fn().mockResolvedValue({ id: USER_ID, blockedAt: null }),
    updatePassword: vi.fn().mockResolvedValue({ id: USER_ID }),
    updateWithRole: vi
      .fn()
      .mockResolvedValue({ id: USER_ID, name: 'Updated', role: 'MEMBER' }),
    getUserProjects: vi.fn().mockResolvedValue([
      {
        projectId: 'proj-1',
        role: 'MEMBER',
        project: { id: 'proj-1', name: 'Test Project' },
      },
    ]),
    setProjectAccess: vi
      .fn()
      .mockResolvedValue({ userId: USER_ID, projectId: 'proj-1', role: 'MEMBER' }),
    removeProjectAccess: vi
      .fn()
      .mockResolvedValue({ userId: USER_ID, projectId: 'proj-1' }),
  };
}

function createMockAuthService() {
  return {
    hashPassword: vi.fn().mockResolvedValue('hashed-password-123'),
    verifyPassword: vi.fn().mockResolvedValue(true),
  };
}

describe('UserController', () => {
  let controller: UserController;
  let service: ReturnType<typeof createMockUserService>;
  let authService: ReturnType<typeof createMockAuthService>;

  beforeEach(() => {
    service = createMockUserService();
    authService = createMockAuthService();
    controller = new UserController(service as any, authService as any);
  });

  it('findAll passes orgId to service', async () => {
    const req = { user: { orgId: ORG_ID, userId: USER_ID, role: 'ADMIN' } };
    const result = await controller.findAll(req);
    expect(service.findAll).toHaveBeenCalledWith(ORG_ID);
    expect(result).toHaveLength(1);
  });

  it('findById passes id to service', async () => {
    const result = await controller.findById(USER_ID);
    expect(service.findById).toHaveBeenCalledWith(USER_ID);
    expect(result).toEqual(expect.objectContaining({ id: USER_ID }));
  });

  it('update passes id and dto to service', async () => {
    const dto = { name: 'Alice Updated' };
    const req = { user: { userId: USER_ID, role: 'ADMIN' } };
    const result = await controller.update(USER_ID, dto, req);
    expect(service.update).toHaveBeenCalledWith(USER_ID, dto);
    expect(result).toEqual(expect.objectContaining({ name: 'Alice Updated' }));
  });

  it('delete passes id to service', async () => {
    const req = { user: { userId: USER_ID, role: 'ADMIN' } };
    const targetId = 'other-user-id';
    const result = await controller.delete(targetId, req);
    expect(service.delete).toHaveBeenCalledWith(targetId);
  });

  it('cannot delete yourself', async () => {
    const req = { user: { userId: USER_ID, role: 'ADMIN' } };
    await expect(controller.delete(USER_ID, req)).rejects.toThrow(ForbiddenException);
  });

  // ─── New endpoint tests ────────────────────────────────────────────

  describe('changePassword()', () => {
    const req = { user: { userId: USER_ID, email: 'alice@example.com', role: 'MEMBER' } };

    it('changes password when current password is correct', async () => {
      const body = { currentPassword: 'old-pw', newPassword: 'new-pw-12345' };
      const result = await controller.changePassword(body, req);
      expect(authService.verifyPassword).toHaveBeenCalledWith('old-pw', 'hashed-old-pw');
      expect(authService.hashPassword).toHaveBeenCalledWith('new-pw-12345');
      expect(service.updatePassword).toHaveBeenCalledWith(USER_ID, 'hashed-password-123');
      expect(result).toEqual({ message: 'Password changed successfully' });
    });

    it('rejects when current password is wrong', async () => {
      authService.verifyPassword.mockResolvedValueOnce(false);
      const body = { currentPassword: 'wrong-pw', newPassword: 'new-pw-12345' };
      await expect(controller.changePassword(body, req)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('create()', () => {
    const adminReq = { user: { userId: USER_ID, orgId: ORG_ID, role: 'ADMIN' } };
    const memberReq = { user: { userId: USER_ID, orgId: ORG_ID, role: 'MEMBER' } };

    it('ADMIN can create a user — calls service.create with orgId from req.user', async () => {
      const dto = { email: 'new@example.com', username: 'newuser', name: 'New User', password: 'Secret1!' };
      const result = await controller.create(dto, adminReq);

      expect(authService.hashPassword).toHaveBeenCalledWith('Secret1!');
      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@example.com',
          username: 'newuser',
          name: 'New User',
          orgId: ORG_ID,
          passwordHash: 'hashed-password-123',
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({ id: 'new-user-id', email: 'new@example.com' }),
      );
    });

    it('non-ADMIN gets ForbiddenException', async () => {
      const dto = { email: 'new@example.com', username: 'newuser', name: 'New User' };
      await expect(controller.create(dto, memberReq)).rejects.toThrow(ForbiddenException);
    });

    it('calls authService.hashPassword when password provided', async () => {
      const dto = { email: 'new@example.com', username: 'newuser', name: 'New User', password: 'MyPass99' };
      await controller.create(dto, adminReq);
      expect(authService.hashPassword).toHaveBeenCalledWith('MyPass99');
    });

    it('generates random password when none provided', async () => {
      const dto = { email: 'new@example.com', username: 'newuser', name: 'New User' };
      await controller.create(dto, adminReq);
      // hashPassword should still be called with the generated password
      expect(authService.hashPassword).toHaveBeenCalled();
    });
  });

  describe('block()', () => {
    const adminReq = { user: { userId: USER_ID, orgId: ORG_ID, role: 'ADMIN' } };
    const memberReq = { user: { userId: USER_ID, orgId: ORG_ID, role: 'MEMBER' } };
    const targetId = 'other-user-id';

    it('ADMIN can block a user — calls service.block(id)', async () => {
      const result = await controller.block(targetId, adminReq);
      expect(service.block).toHaveBeenCalledWith(targetId);
      expect(result).toEqual(expect.objectContaining({ id: USER_ID, blockedAt: expect.any(Date) }));
    });

    it('non-ADMIN gets ForbiddenException', async () => {
      await expect(controller.block(targetId, memberReq)).rejects.toThrow(ForbiddenException);
    });

    it('cannot block yourself (userId === id) — ForbiddenException', async () => {
      await expect(controller.block(USER_ID, adminReq)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('unblock()', () => {
    const adminReq = { user: { userId: USER_ID, orgId: ORG_ID, role: 'ADMIN' } };
    const memberReq = { user: { userId: USER_ID, orgId: ORG_ID, role: 'MEMBER' } };
    const targetId = 'other-user-id';

    it('ADMIN can unblock — calls service.unblock(id)', async () => {
      const result = await controller.unblock(targetId, adminReq);
      expect(service.unblock).toHaveBeenCalledWith(targetId);
      expect(result).toEqual(expect.objectContaining({ id: USER_ID, blockedAt: null }));
    });

    it('non-ADMIN gets ForbiddenException', async () => {
      await expect(controller.unblock(targetId, memberReq)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('regeneratePassword()', () => {
    const adminReq = { user: { userId: USER_ID, orgId: ORG_ID, role: 'ADMIN' } };
    const memberReq = { user: { userId: USER_ID, orgId: ORG_ID, role: 'MEMBER' } };
    const targetId = 'other-user-id';

    it('ADMIN can regenerate — calls authService.hashPassword + service.updatePassword', async () => {
      await controller.regeneratePassword(targetId, adminReq);
      expect(authService.hashPassword).toHaveBeenCalled();
      expect(service.updatePassword).toHaveBeenCalledWith(targetId, 'hashed-password-123');
    });

    it('returns object with password field (plaintext, shown once)', async () => {
      const result = await controller.regeneratePassword(targetId, adminReq);
      expect(result).toHaveProperty('password');
      expect(typeof result.password).toBe('string');
      expect(result.password.length).toBeGreaterThan(0);
    });

    it('non-ADMIN gets ForbiddenException', async () => {
      await expect(controller.regeneratePassword(targetId, memberReq)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getUserProjects()', () => {
    it('returns user project memberships for self', async () => {
      const req = { user: { userId: USER_ID, role: 'MEMBER' } };
      const result = await controller.getUserProjects(USER_ID, req);
      expect(service.getUserProjects).toHaveBeenCalledWith(USER_ID);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            projectId: 'proj-1',
            role: 'MEMBER',
            project: expect.objectContaining({ id: 'proj-1', name: 'Test Project' }),
          }),
        ]),
      );
    });

    it('rejects non-admin viewing other user projects', () => {
      const req = { user: { userId: USER_ID, role: 'MEMBER' } };
      expect(() => controller.getUserProjects('other-user-id', req)).toThrow(ForbiddenException);
    });
  });

  describe('setProjectAccess()', () => {
    const adminReq = { user: { userId: USER_ID, orgId: ORG_ID, role: 'ADMIN' } };
    const memberReq = { user: { userId: USER_ID, orgId: ORG_ID, role: 'MEMBER' } };
    const targetId = 'other-user-id';
    const projectId = 'proj-1';

    it('ADMIN can set access — calls service.setProjectAccess(userId, projectId, role)', async () => {
      const body = { role: 'MEMBER' };
      const result = await controller.setProjectAccess(targetId, projectId, body, adminReq);
      expect(service.setProjectAccess).toHaveBeenCalledWith(targetId, projectId, 'MEMBER');
      expect(result).toEqual(
        expect.objectContaining({ userId: USER_ID, projectId: 'proj-1', role: 'MEMBER' }),
      );
    });

    it('non-ADMIN gets ForbiddenException', async () => {
      const body = { role: 'MEMBER' };
      await expect(
        controller.setProjectAccess(targetId, projectId, body, memberReq),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('removeProjectAccess()', () => {
    const adminReq = { user: { userId: USER_ID, orgId: ORG_ID, role: 'ADMIN' } };
    const memberReq = { user: { userId: USER_ID, orgId: ORG_ID, role: 'MEMBER' } };
    const targetId = 'other-user-id';
    const projectId = 'proj-1';

    it('ADMIN can remove access — calls service.removeProjectAccess(userId, projectId)', async () => {
      const result = await controller.removeProjectAccess(targetId, projectId, adminReq);
      expect(service.removeProjectAccess).toHaveBeenCalledWith(targetId, projectId);
      expect(result).toEqual(
        expect.objectContaining({ userId: USER_ID, projectId: 'proj-1' }),
      );
    });

    it('non-ADMIN gets ForbiddenException', async () => {
      await expect(
        controller.removeProjectAccess(targetId, projectId, memberReq),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update() — role changes', () => {
    it('ADMIN can update role and email via updateWithRole', async () => {
      const dto = { name: 'Updated', role: 'MEMBER', email: 'updated@example.com' };
      const req = { user: { userId: USER_ID, orgId: ORG_ID, role: 'ADMIN' } };
      const targetId = 'other-user-id';
      const result = await controller.update(targetId, dto, req);
      expect(service.updateWithRole).toHaveBeenCalledWith(targetId, dto);
      expect(result).toEqual(expect.objectContaining({ id: USER_ID, role: 'MEMBER' }));
    });

    it('ADMIN cannot demote themselves (change own role from ADMIN) — ForbiddenException', async () => {
      const dto = { role: 'MEMBER' };
      const req = { user: { userId: USER_ID, orgId: ORG_ID, role: 'ADMIN' } };
      await expect(controller.update(USER_ID, dto, req)).rejects.toThrow(ForbiddenException);
    });
  });
});
