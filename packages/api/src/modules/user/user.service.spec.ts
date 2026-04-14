import { createPrismaMock, PrismaMock } from '../../common/utils/prisma-mock';
import { UserService } from './user.service';
import { PrismaService } from '../../database/prisma.service';

describe('UserService', () => {
  let service: UserService;
  let prisma: PrismaMock;

  const mockUser = {
    id: 'user-uuid-1',
    orgId: 'org-uuid-1',
    email: 'test@example.com',
    username: 'testuser',
    name: 'Test User',
    role: 'MEMBER',
    password: 'hashed-password',
    avatarUrl: null,
    blockedAt: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new UserService(prisma as unknown as PrismaService);
  });

  describe('findById()', () => {
    it('should return a user by id', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findById('user-uuid-1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        select: expect.objectContaining({ id: true, email: true, name: true, role: true }),
      });
      expect(result).toEqual(mockUser);
    });

    it('should return null when user is not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.findById('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('findByEmail()', () => {
    it('should return a user by email', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findByEmail('test@example.com');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(result).toEqual(mockUser);
    });

    it('should return null when email is not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.findByEmail('unknown@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findAll()', () => {
    it('should return all users for an organization', async () => {
      const users = [
        { ...mockUser, id: 'user-1', name: 'User One' },
        { ...mockUser, id: 'user-2', name: 'User Two', email: 'two@example.com' },
      ];

      prisma.user.findMany.mockResolvedValue(users);

      const result = await service.findAll('org-uuid-1');

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { orgId: 'org-uuid-1' },
        select: expect.objectContaining({ id: true, email: true, name: true, role: true }),
      });
      expect(result).toEqual(users);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no users in org', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      const result = await service.findAll('empty-org-id');

      expect(result).toEqual([]);
    });
  });

  describe('update()', () => {
    it('should update user fields', async () => {
      const dto = { name: 'Updated Name' };
      const updated = { ...mockUser, ...dto };

      prisma.user.update.mockResolvedValue(updated);

      const result = await service.update('user-uuid-1', dto);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        data: dto,
        select: expect.objectContaining({ id: true, email: true, name: true, role: true }),
      });
      expect(result).toEqual(updated);
    });

    it('should update multiple fields at once', async () => {
      const dto = { name: 'New Name', avatarUrl: 'https://avatar.com/img.png' };
      const updated = { ...mockUser, ...dto };

      prisma.user.update.mockResolvedValue(updated);

      const result = await service.update('user-uuid-1', dto);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        data: dto,
        select: expect.objectContaining({ id: true, email: true, name: true, role: true }),
      });
      expect(result.name).toBe('New Name');
      expect(result.avatarUrl).toBe('https://avatar.com/img.png');
    });
  });

  describe('delete()', () => {
    it('should delete a user by id', async () => {
      prisma.user.delete.mockResolvedValue(mockUser);

      const result = await service.delete('user-uuid-1');

      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        select: expect.objectContaining({ id: true, email: true, name: true, role: true }),
      });
      expect(result).toEqual(mockUser);
    });

    it('should propagate errors when user does not exist', async () => {
      prisma.user.delete.mockRejectedValue(
        new Error('Record to delete does not exist'),
      );

      await expect(service.delete('nonexistent-id')).rejects.toThrow(
        'Record to delete does not exist',
      );
    });
  });

  describe('create()', () => {
    it('should create a user with provided data', async () => {
      const createData = {
        orgId: 'org-uuid-1',
        email: 'new@example.com',
        username: 'newuser',
        name: 'New User',
        role: 'MEMBER',
        passwordHash: 'hashed-pw',
      };
      const createdUser = {
        ...mockUser,
        id: 'new-user-uuid',
        email: createData.email,
        name: createData.name,
      };

      prisma.user.create.mockResolvedValue(createdUser);

      const result = await service.create(createData);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          orgId: 'org-uuid-1',
          email: 'new@example.com',
          username: 'newuser',
          name: 'New User',
          role: 'MEMBER',
          password: 'hashed-pw',
        },
        select: expect.objectContaining({ id: true, email: true, name: true, role: true }),
      });
      expect(result).toEqual(createdUser);
    });
  });

  describe('block()', () => {
    it('should set blockedAt to a Date', async () => {
      const blockedUser = { ...mockUser, blockedAt: new Date('2026-04-13') };

      prisma.user.update.mockResolvedValue(blockedUser);

      const result = await service.block('user-uuid-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        data: { blockedAt: expect.any(Date) },
        select: expect.objectContaining({ id: true, email: true, blockedAt: true }),
      });
      expect(result).toEqual(blockedUser);
      expect(result.blockedAt).toBeInstanceOf(Date);
    });
  });

  describe('unblock()', () => {
    it('should set blockedAt to null', async () => {
      const unblockedUser = { ...mockUser, blockedAt: null };

      prisma.user.update.mockResolvedValue(unblockedUser);

      const result = await service.unblock('user-uuid-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        data: { blockedAt: null },
        select: expect.objectContaining({ id: true, email: true, blockedAt: true }),
      });
      expect(result).toEqual(unblockedUser);
      expect(result.blockedAt).toBeNull();
    });
  });

  describe('updatePassword()', () => {
    it('should update the password and exclude it from the result', async () => {
      const userWithoutPassword = { ...mockUser };

      prisma.user.update.mockResolvedValue(userWithoutPassword);

      const result = await service.updatePassword('user-uuid-1', 'new-hashed-password');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        data: { password: 'new-hashed-password' },
        select: expect.objectContaining({ id: true, email: true, name: true, role: true }),
      });
      expect(result).toEqual(userWithoutPassword);
    });
  });

  describe('updateWithRole()', () => {
    it('should update name, email, and role fields', async () => {
      const dto = { name: 'Admin User', email: 'admin@example.com', role: 'ADMIN' };
      const updatedUser = { ...mockUser, ...dto };

      prisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateWithRole('user-uuid-1', dto);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        data: dto,
        select: expect.objectContaining({ id: true, email: true, name: true, role: true }),
      });
      expect(result).toEqual(updatedUser);
      expect(result.name).toBe('Admin User');
      expect(result.email).toBe('admin@example.com');
      expect(result.role).toBe('ADMIN');
    });
  });

  describe('getUserProjects()', () => {
    it('should return project memberships with project info', async () => {
      const memberships = [
        {
          id: 'pm-1',
          userId: 'user-uuid-1',
          projectId: 'proj-1',
          role: 'MEMBER',
          project: { id: 'proj-1', name: 'Project Alpha' },
        },
        {
          id: 'pm-2',
          userId: 'user-uuid-1',
          projectId: 'proj-2',
          role: 'EDITOR',
          project: { id: 'proj-2', name: 'Project Beta' },
        },
      ];

      prisma.projectMember.findMany.mockResolvedValue(memberships);

      const result = await service.getUserProjects('user-uuid-1');

      expect(prisma.projectMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-uuid-1' },
          include: expect.objectContaining({ project: expect.anything() }),
        }),
      );
      expect(result).toEqual(memberships);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when user has no projects', async () => {
      prisma.projectMember.findMany.mockResolvedValue([]);

      const result = await service.getUserProjects('user-uuid-1');

      expect(result).toEqual([]);
    });
  });

  describe('setProjectAccess()', () => {
    it('should upsert project membership with compound key', async () => {
      const membership = {
        id: 'pm-1',
        userId: 'user-uuid-1',
        projectId: 'proj-1',
        role: 'EDITOR',
      };

      prisma.projectMember.upsert.mockResolvedValue(membership);

      const result = await service.setProjectAccess('user-uuid-1', 'proj-1', 'EDITOR');

      expect(prisma.projectMember.upsert).toHaveBeenCalledWith({
        where: {
          projectId_userId: {
            projectId: 'proj-1',
            userId: 'user-uuid-1',
          },
        },
        create: {
          userId: 'user-uuid-1',
          projectId: 'proj-1',
          role: 'EDITOR',
        },
        update: {
          role: 'EDITOR',
        },
      });
      expect(result).toEqual(membership);
    });
  });

  describe('removeProjectAccess()', () => {
    it('should delete project membership with compound key', async () => {
      const membership = {
        id: 'pm-1',
        userId: 'user-uuid-1',
        projectId: 'proj-1',
        role: 'MEMBER',
      };

      prisma.projectMember.delete.mockResolvedValue(membership);

      const result = await service.removeProjectAccess('user-uuid-1', 'proj-1');

      expect(prisma.projectMember.delete).toHaveBeenCalledWith({
        where: {
          projectId_userId: {
            projectId: 'proj-1',
            userId: 'user-uuid-1',
          },
        },
      });
      expect(result).toEqual(membership);
    });
  });
});
