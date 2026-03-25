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
    name: 'Test User',
    role: 'MEMBER',
    password: 'hashed-password',
    avatarUrl: null,
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
});
