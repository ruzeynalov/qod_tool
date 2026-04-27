import { createPrismaMock, PrismaMock } from '../../common/utils/prisma-mock';
import { NotificationService } from './notification.service';
import { PrismaService } from '../../database/prisma.service';

describe('NotificationService', () => {
  let service: NotificationService;
  let prisma: PrismaMock;

  const userId = 'user-uuid-1';

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new NotificationService(prisma as unknown as PrismaService);
  });

  describe('getNotifications()', () => {
    it('should return notifications ordered by createdAt desc', async () => {
      const notifications = [
        { id: 'n-1', userId, title: 'New alert', body: 'Coverage dropped', read: false, createdAt: new Date('2026-04-15') },
        { id: 'n-2', userId, title: 'Old alert', body: 'Flaky test', read: true, createdAt: new Date('2026-04-14') },
      ];

      prisma.notification.findMany.mockResolvedValue(notifications);

      const result = await service.getNotifications(userId);

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId, muted: false },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      expect(result).toEqual(notifications);
    });
  });

  describe('getUnreadCount()', () => {
    it('should return count of unread notifications', async () => {
      prisma.notification.count.mockResolvedValue(5);

      const result = await service.getUnreadCount(userId);

      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId, read: false, muted: false },
      });
      expect(result).toBe(5);
    });
  });

  describe('markAsRead()', () => {
    it('should verify ownership then update notification read status', async () => {
      const notificationId = 'n-1';
      const existing = { id: notificationId, userId, title: 'Alert', body: 'body', read: false, createdAt: new Date() };
      const updated = { ...existing, read: true };

      prisma.notification.findFirst.mockResolvedValue(existing);
      prisma.notification.update.mockResolvedValue(updated);

      const result = await service.markAsRead(notificationId, userId);

      expect(prisma.notification.findFirst).toHaveBeenCalledWith({ where: { id: notificationId, userId } });
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: notificationId },
        data: { read: true },
      });
      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException when notification does not belong to the user', async () => {
      prisma.notification.findFirst.mockResolvedValue(null);

      await expect(service.markAsRead('n-1', userId))
        .rejects.toThrow('Notification not found');
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });
  });

  describe('markAllAsRead()', () => {
    it('should update all unread notifications for user', async () => {
      const updateResult = { count: 3 };
      prisma.notification.updateMany.mockResolvedValue(updateResult);

      const result = await service.markAllAsRead(userId);

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId, read: false },
        data: { read: true },
      });
      expect(result).toEqual(updateResult);
    });
  });

  describe('getLog()', () => {
    it('should apply pagination, project, search, and metric filters', async () => {
      const items = [
        {
          id: 'n-1',
          userId,
          projectId: 'project-1',
          title: 'Alert',
          body: 'Defect density increased',
          read: false,
          muted: true,
          createdAt: new Date(),
          project: { id: 'project-1', name: 'Payments' },
          alertRule: {
            id: 'rule-1',
            metric: 'DEFECT_DENSITY',
            condition: 'GREATER_THAN',
            threshold: 5,
            enabled: true,
          },
        },
      ];

      prisma.notification.count.mockResolvedValue(1);
      prisma.notification.findMany.mockResolvedValue(items);

      const result = await service.getLog(userId, {
        page: 2,
        pageSize: 150,
        search: 'Def',
        projectId: 'project-1',
        metrics: ['DEFECT_DENSITY', 'ESCAPE_RATE'],
      });

      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: {
          userId,
          projectId: 'project-1',
          OR: [
            { title: { contains: 'Def', mode: 'insensitive' } },
            { body: { contains: 'Def', mode: 'insensitive' } },
            { alertRule: { metric: { in: ['DEFECT_DENSITY', 'ESCAPE_RATE'] } } },
          ],
        },
      });
      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          projectId: 'project-1',
          OR: [
            { title: { contains: 'Def', mode: 'insensitive' } },
            { body: { contains: 'Def', mode: 'insensitive' } },
            { alertRule: { metric: { in: ['DEFECT_DENSITY', 'ESCAPE_RATE'] } } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        skip: 100,
        take: 100,
        include: {
          project: { select: { id: true, name: true } },
          alertRule: {
            select: { id: true, metric: true, condition: true, threshold: true, enabled: true },
          },
        },
      });
      expect(result).toEqual({ items, total: 1, page: 2, pageSize: 100 });
    });

    it('should normalize invalid pagination values and omit search filters when blank', async () => {
      prisma.notification.count.mockResolvedValue(0);
      prisma.notification.findMany.mockResolvedValue([]);

      const result = await service.getLog(userId, {
        page: 0,
        pageSize: -5,
        search: '   ',
      });

      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId },
      });
      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
          skip: 0,
          take: 1,
        }),
      );
      expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 1 });
    });
  });

  describe('mute()', () => {
    it('should verify ownership then mute the notification', async () => {
      prisma.notification.findFirst.mockResolvedValue({ id: 'n-1' });
      prisma.notification.update.mockResolvedValue({ id: 'n-1', muted: true });

      const result = await service.mute('n-1', userId);

      expect(prisma.notification.findFirst).toHaveBeenCalledWith({
        where: { id: 'n-1', userId },
        select: { id: true },
      });
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'n-1' },
        data: { muted: true },
      });
      expect(result).toEqual({ id: 'n-1', muted: true });
    });

    it('should throw NotFoundException when notification does not belong to the user', async () => {
      prisma.notification.findFirst.mockResolvedValue(null);

      await expect(service.mute('n-1', userId)).rejects.toThrow('Notification not found');
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });
  });

  describe('unmute()', () => {
    it('should verify ownership then unmute the notification', async () => {
      prisma.notification.findFirst.mockResolvedValue({ id: 'n-1' });
      prisma.notification.update.mockResolvedValue({ id: 'n-1', muted: false });

      const result = await service.unmute('n-1', userId);

      expect(prisma.notification.findFirst).toHaveBeenCalledWith({
        where: { id: 'n-1', userId },
        select: { id: true },
      });
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'n-1' },
        data: { muted: false },
      });
      expect(result).toEqual({ id: 'n-1', muted: false });
    });
  });
});
