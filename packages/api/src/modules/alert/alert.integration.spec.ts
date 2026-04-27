// ── BullMQ mocks (hoisted before imports) ────────────────────
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({}),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { APP_GUARD } from '@nestjs/core';
import { CanActivate, ExecutionContext } from '@nestjs/common';
import { AlertController } from './alert.controller';
import { AlertService } from './alert.service';
import { NotificationController } from '../notification/notification.controller';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../../database/prisma.service';
import { ProjectAccessGuard } from '../../common/guards/project-access.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { createPrismaMock, PrismaMock } from '../../common/utils/prisma-mock';

// ── Constants ────────────────────────────────────────────────
const userId = '00000000-0000-0000-0000-000000000001';
const orgId = '00000000-0000-0000-0000-000000000099';
const projectId = '00000000-0000-0000-0000-000000000010';
const otherProjectId = '00000000-0000-0000-0000-000000000011';
const ruleId = '00000000-0000-0000-0000-000000000020';
const notifId = '00000000-0000-0000-0000-000000000030';

let currentUser = { id: userId, userId, email: 'test@test.com', role: 'MEMBER', orgId };

class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    req.user = currentUser;
    return true;
  }
}

// ── Suite ────────────────────────────────────────────────────
describe('Alert & Notification integration (NestJS HTTP)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaMock;

  beforeAll(async () => {
    prisma = createPrismaMock();
    prisma.project.findMany.mockResolvedValue([]);
    // Default: no ADMIN recipients so existing expectations (one
    // notification per project member) remain stable.
    prisma.user.findMany.mockResolvedValue([]);

    const moduleRef = await Test.createTestingModule({
      controllers: [AlertController, NotificationController],
      providers: [
        AlertService,
        NotificationService,
        RolesGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: APP_GUARD, useClass: TestAuthGuard },
      ],
    })
      .overrideGuard(ProjectAccessGuard)
      .useValue(new ProjectAccessGuard(prisma as unknown as PrismaService))
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = { id: userId, userId, email: 'test@test.com', role: 'MEMBER', orgId };
    prisma.project.findUnique.mockResolvedValue({ orgId });
    prisma.projectMember.findUnique.mockResolvedValue({ userId, projectId });
    prisma.projectMember.findFirst.mockResolvedValue(null);
  });

  // ─── 1. CRUD roundtrip via HTTP ────────────────────────────

  it('should create, list, update, and delete an alert rule through HTTP', async () => {
    currentUser = { ...currentUser, role: 'ADMIN' };

    const rule = {
      id: ruleId, projectId, metric: 'COVERAGE_PCT', condition: 'LESS_THAN',
      threshold: 80, channel: 'IN_APP', channelConfig: {}, enabled: true,
      lastTriggered: null, createdAt: new Date().toISOString(),
    };

    prisma.alertRule.create.mockResolvedValue(rule);
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/alerts`,
      payload: { metric: 'COVERAGE_PCT', condition: 'LESS_THAN', threshold: 80, channel: 'IN_APP' },
    });
    expect(createRes.statusCode).toBe(201);
    expect(prisma.alertRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ projectId, metric: 'COVERAGE_PCT' }),
    });

    prisma.alertRule.findMany.mockResolvedValue([rule]);
    const listRes = await app.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/alerts` });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json()).toHaveLength(1);

    const updated = { ...rule, threshold: 60 };
    prisma.alertRule.findFirst.mockResolvedValue(rule);
    prisma.alertRule.update.mockResolvedValue(updated);
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${projectId}/alerts/${ruleId}`,
      payload: { threshold: 60 },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(prisma.alertRule.findFirst).toHaveBeenCalledWith({ where: { id: ruleId, projectId } });
    expect(prisma.alertRule.update).toHaveBeenCalledWith({
      where: { id: ruleId },
      data: expect.objectContaining({ threshold: 60 }),
    });

    prisma.alertRule.findFirst.mockResolvedValue(rule);
    prisma.alertRule.delete.mockResolvedValue(rule);
    const delRes = await app.inject({ method: 'DELETE', url: `/api/v1/projects/${projectId}/alerts/${ruleId}` });
    expect(delRes.statusCode).toBe(200);
    expect(prisma.alertRule.delete).toHaveBeenCalledWith({ where: { id: ruleId } });
  });

  it('should reject alert mutations for non-admin members', async () => {
    prisma.projectMember.findFirst.mockResolvedValue({ role: 'MEMBER' });

    const createRes = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/alerts`,
      payload: { metric: 'COVERAGE_PCT', condition: 'LESS_THAN', threshold: 80, channel: 'IN_APP' },
    });
    expect(createRes.statusCode).toBe(403);
    expect(prisma.alertRule.create).not.toHaveBeenCalled();

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${projectId}/alerts/${ruleId}`,
      payload: { threshold: 60 },
    });
    expect(patchRes.statusCode).toBe(403);
    expect(prisma.alertRule.update).not.toHaveBeenCalled();

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${projectId}/alerts/${ruleId}`,
    });
    expect(deleteRes.statusCode).toBe(403);
    expect(prisma.alertRule.delete).not.toHaveBeenCalled();
  });

  // ─── 2. Evaluation → notification creation ─────────────────

  it('should create IN_APP notifications for project members when evaluation triggers', async () => {
    const rule = {
      id: ruleId, projectId, metric: 'COVERAGE_PCT', condition: 'LESS_THAN',
      threshold: 80, channel: 'IN_APP', channelConfig: {}, enabled: true,
      lastTriggered: null, createdAt: new Date(),
    };

    prisma.alertRule.findMany.mockResolvedValue([rule]);
    prisma.kPISnapshot.findMany.mockResolvedValue([
      { id: 'snap-1', projectId, metric: 'COVERAGE_PCT', value: 75, recordedAt: new Date() },
    ]);
    prisma.projectMember.findMany.mockResolvedValue([
      { userId: '00000000-0000-0000-0000-000000000001' },
      { userId: '00000000-0000-0000-0000-000000000002' },
    ]);
    prisma.notification.create.mockResolvedValue({});
    prisma.alertRule.update.mockResolvedValue({});

    const res = await app.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/alerts/evaluate` });

    expect(res.statusCode).toBe(201);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: '00000000-0000-0000-0000-000000000001',
        title: expect.stringContaining('COVERAGE_PCT'),
      }),
    });
    expect(prisma.alertRule.update).toHaveBeenCalledWith({
      where: { id: ruleId },
      data: { inBreach: true, lastTriggered: expect.any(Date) },
    });
  });

  // ─── 3. ProjectAccessGuard blocks access for non-members ───

  it('should return 403 when ProjectAccessGuard rejects a user without project membership', async () => {
    prisma.project.findUnique.mockResolvedValue({ orgId });
    prisma.projectMember.findUnique.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: `/api/v1/projects/${otherProjectId}/alerts` });

    expect(res.statusCode).toBe(403);
    expect(prisma.alertRule.findMany).not.toHaveBeenCalled();
  });

  // ─── 4. Service-level ownership rejects cross-project mutation ──

  it('should return 404 when alert does not belong to the project', async () => {
    currentUser = { ...currentUser, role: 'ADMIN' };
    prisma.alertRule.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${projectId}/alerts/${ruleId}`,
      payload: { threshold: 50 },
    });

    expect(res.statusCode).toBe(404);
    expect(prisma.alertRule.findFirst).toHaveBeenCalledWith({ where: { id: ruleId, projectId } });
    expect(prisma.alertRule.update).not.toHaveBeenCalled();
  });

  // ─── 5. State-based dedup prevents duplicate notifications ──

  it('should not create notifications when rule is already inBreach', async () => {
    prisma.alertRule.findMany.mockResolvedValue([{
      id: ruleId, projectId, metric: 'COVERAGE_PCT', condition: 'LESS_THAN',
      threshold: 80, channel: 'IN_APP', channelConfig: {}, enabled: true,
      inBreach: true, lastTriggered: new Date(), createdAt: new Date(),
    }]);
    prisma.kPISnapshot.findMany.mockResolvedValue([
      { id: 'snap-1', projectId, metric: 'COVERAGE_PCT', value: 75, recordedAt: new Date() },
    ]);

    const res = await app.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/alerts/evaluate` });

    expect(res.statusCode).toBe(201);
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.alertRule.update).not.toHaveBeenCalled();
  });

  // ─── 6. Notification listing, log, and mutations via HTTP ─────

  it('should list notifications, get unread count, query the log, and mutate read state via HTTP', async () => {
    const notif = { id: notifId, userId, title: 'Alert', body: '...', read: false, createdAt: new Date().toISOString() };
    const logItem = {
      ...notif,
      muted: true,
      projectId,
      project: { id: projectId, name: 'Payments' },
      alertRule: {
        id: ruleId,
        metric: 'DEFECT_DENSITY',
        condition: 'GREATER_THAN',
        threshold: 5,
        enabled: true,
      },
    };

    prisma.notification.findMany.mockResolvedValue([notif]);
    const listRes = await app.inject({ method: 'GET', url: '/api/v1/notifications' });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json()).toHaveLength(1);
    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: { userId, muted: false },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    prisma.notification.count.mockResolvedValue(1);
    const countRes = await app.inject({ method: 'GET', url: '/api/v1/notifications/unread-count' });
    expect(countRes.statusCode).toBe(200);
    expect(countRes.json()).toEqual({ count: 1 });

    prisma.notification.count.mockResolvedValue(1);
    prisma.notification.findMany.mockResolvedValue([logItem]);
    const logRes = await app.inject({
      method: 'GET',
      url: `/api/v1/notifications/log?page=2&pageSize=10&search=Def&projectId=${projectId}&metrics=DEFECT_DENSITY,ESCAPE_RATE`,
    });
    expect(logRes.statusCode).toBe(200);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId,
          projectId,
          OR: [
            { title: { contains: 'Def', mode: 'insensitive' } },
            { body: { contains: 'Def', mode: 'insensitive' } },
            { alertRule: { metric: { in: ['DEFECT_DENSITY', 'ESCAPE_RATE'] } } },
          ],
        },
        skip: 10,
        take: 10,
      }),
    );

    prisma.notification.findFirst.mockResolvedValue(notif);
    prisma.notification.update.mockResolvedValue({ ...notif, read: true });
    const readRes = await app.inject({ method: 'PATCH', url: `/api/v1/notifications/${notifId}/read` });
    expect(readRes.statusCode).toBe(200);
    expect(readRes.json().read).toBe(true);
    expect(prisma.notification.findFirst).toHaveBeenCalledWith({ where: { id: notifId, userId } });
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: notifId },
      data: { read: true },
    });

    prisma.notification.findFirst.mockResolvedValue({ id: notifId });
    prisma.notification.update.mockResolvedValue({ ...notif, muted: true });
    const muteRes = await app.inject({ method: 'POST', url: `/api/v1/notifications/${notifId}/mute` });
    expect(muteRes.statusCode).toBe(201);
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: notifId },
      data: { muted: true },
    });

    prisma.notification.findFirst.mockResolvedValue({ id: notifId });
    prisma.notification.update.mockResolvedValue({ ...notif, muted: false });
    const unmuteRes = await app.inject({ method: 'POST', url: `/api/v1/notifications/${notifId}/unmute` });
    expect(unmuteRes.statusCode).toBe(201);
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: notifId },
      data: { muted: false },
    });
  });

  // ─── 7. End-to-end: evaluate → list → mark read ───────────

  it('should produce notifications via evaluation that appear in list and can be marked read', async () => {
    const rule = {
      id: ruleId, projectId, metric: 'COVERAGE_PCT', condition: 'LESS_THAN',
      threshold: 80, channel: 'IN_APP', channelConfig: {}, enabled: true,
      lastTriggered: null, createdAt: new Date(),
    };
    const createdNotif = {
      id: notifId, userId, title: 'Alert: COVERAGE_PCT threshold breached',
      body: 'COVERAGE_PCT is 75, which breaches the LESS_THAN 80 threshold.',
      read: false, createdAt: new Date().toISOString(),
    };

    prisma.alertRule.findMany.mockResolvedValue([rule]);
    prisma.kPISnapshot.findMany.mockResolvedValue([
      { id: 'snap-1', projectId, metric: 'COVERAGE_PCT', value: 75, recordedAt: new Date() },
    ]);
    prisma.projectMember.findMany.mockResolvedValue([{ userId }]);
    prisma.notification.create.mockResolvedValue(createdNotif);
    prisma.alertRule.update.mockResolvedValue({});

    const evalRes = await app.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/alerts/evaluate` });
    expect(evalRes.statusCode).toBe(201);
    const createCall = prisma.notification.create.mock.calls[0][0];
    expect(createCall.data.userId).toBe(userId);
    expect(createCall.data.title).toContain('COVERAGE_PCT');

    prisma.notification.findMany.mockResolvedValue([createdNotif]);
    prisma.notification.count.mockResolvedValue(1);
    const listRes = await app.inject({ method: 'GET', url: '/api/v1/notifications' });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json()[0].read).toBe(false);

    const countRes = await app.inject({ method: 'GET', url: '/api/v1/notifications/unread-count' });
    expect(countRes.json().count).toBe(1);

    prisma.notification.findFirst.mockResolvedValue(createdNotif);
    prisma.notification.update.mockResolvedValue({ ...createdNotif, read: true });
    const readRes = await app.inject({ method: 'PATCH', url: `/api/v1/notifications/${notifId}/read` });
    expect(readRes.statusCode).toBe(200);
    expect(readRes.json().read).toBe(true);

    prisma.notification.count.mockResolvedValue(0);
    const countRes2 = await app.inject({ method: 'GET', url: '/api/v1/notifications/unread-count' });
    expect(countRes2.json().count).toBe(0);
  });
});
