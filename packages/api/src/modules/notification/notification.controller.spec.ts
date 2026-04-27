import { NotificationController } from './notification.controller';

const USER_ID = 'user-uuid-1';

function createMockNotificationService() {
  return {
    getNotifications: vi.fn().mockResolvedValue([
      { id: 'n-1', userId: USER_ID, title: 'Alert', body: 'Coverage dropped', read: false, createdAt: new Date() },
    ]),
    getUnreadCount: vi.fn().mockResolvedValue(3),
    getLog: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    markAsRead: vi.fn().mockResolvedValue({
      id: 'n-1', userId: USER_ID, title: 'Alert', body: 'Coverage dropped', read: true, createdAt: new Date(),
    }),
    markAllAsRead: vi.fn().mockResolvedValue({ count: 5 }),
    mute: vi.fn().mockResolvedValue({ id: 'n-1', muted: true }),
    unmute: vi.fn().mockResolvedValue({ id: 'n-1', muted: false }),
  };
}

describe('NotificationController', () => {
  let controller: NotificationController;
  let service: ReturnType<typeof createMockNotificationService>;

  const req = { user: { userId: USER_ID, role: 'MEMBER', orgId: 'org-1' } };

  beforeEach(() => {
    service = createMockNotificationService();
    controller = new NotificationController(service as any);
  });

  it('GET /notifications should return user notifications', async () => {
    const result = await controller.getNotifications(req);
    expect(service.getNotifications).toHaveBeenCalledWith(USER_ID);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({ id: 'n-1' }));
  });

  it('GET /notifications/unread-count should return unread count', async () => {
    const result = await controller.getUnreadCount(req);
    expect(service.getUnreadCount).toHaveBeenCalledWith(USER_ID);
    expect(result).toEqual({ count: 3 });
  });

  it('GET /notifications/log should parse query params and return paginated log data', async () => {
    const result = await controller.getLog(
      req,
      '2',
      '50',
      'Def',
      'project-1',
      'DEFECT_DENSITY,ESCAPE_RATE,',
    );

    expect(service.getLog).toHaveBeenCalledWith(USER_ID, {
      page: 2,
      pageSize: 50,
      search: 'Def',
      projectId: 'project-1',
      metrics: ['DEFECT_DENSITY', 'ESCAPE_RATE'],
    });
    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it('PATCH /notifications/:id/read should mark notification as read', async () => {
    const result = await controller.markAsRead('n-1', req);
    expect(service.markAsRead).toHaveBeenCalledWith('n-1', USER_ID);
    expect(result).toEqual(expect.objectContaining({ id: 'n-1', read: true }));
  });

  it('POST /notifications/read-all should mark all as read', async () => {
    const result = await controller.markAllAsRead(req);
    expect(service.markAllAsRead).toHaveBeenCalledWith(USER_ID);
    expect(result).toEqual({ count: 5 });
  });

  it('POST /notifications/:id/mute should mute the notification', async () => {
    const result = await controller.mute('n-1', req);
    expect(service.mute).toHaveBeenCalledWith('n-1', USER_ID);
    expect(result).toEqual({ id: 'n-1', muted: true });
  });

  it('POST /notifications/:id/unmute should unmute the notification', async () => {
    const result = await controller.unmute('n-1', req);
    expect(service.unmute).toHaveBeenCalledWith('n-1', USER_ID);
    expect(result).toEqual({ id: 'n-1', muted: false });
  });
});
