import { createPrismaMock, PrismaMock } from '../../common/utils/prisma-mock';
import { AlertService } from './alert.service';
import { PrismaService } from '../../database/prisma.service';

describe('AlertService', () => {
  let service: AlertService;
  let prisma: PrismaMock;

  const projectId = 'proj-uuid-1';

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new AlertService(prisma as unknown as PrismaService);
    // Reset global fetch mock
    vi.restoreAllMocks();
  });

  // ─── CRUD ──────────────────────────────────────────────────

  describe('createAlertRule()', () => {
    it('should create a new alert rule', async () => {
      const dto = {
        metric: 'COVERAGE_PCT',
        condition: 'LESS_THAN',
        threshold: 80,
        channel: 'SLACK',
        channelConfig: { webhookUrl: 'https://hooks.slack.com/xxx' },
      };

      const created = { id: 'rule-1', projectId, ...dto, enabled: true, lastTriggered: null, createdAt: new Date() };
      prisma.alertRule.create.mockResolvedValue(created);

      const result = await service.createAlertRule(projectId, dto as any);

      expect(prisma.alertRule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          projectId,
          metric: 'COVERAGE_PCT',
          condition: 'LESS_THAN',
          threshold: 80,
          channel: 'SLACK',
        }),
      });
      expect(result).toEqual(created);
    });
  });

  describe('updateAlertRule()', () => {
    it('should update an existing alert rule', async () => {
      const id = 'rule-1';
      const dto = { threshold: 75, enabled: false };
      const updated = {
        id,
        projectId,
        metric: 'COVERAGE_PCT',
        condition: 'LESS_THAN',
        threshold: 75,
        channel: 'SLACK',
        channelConfig: {},
        enabled: false,
        lastTriggered: null,
        createdAt: new Date(),
      };

      prisma.alertRule.update.mockResolvedValue(updated);

      const result = await service.updateAlertRule(id, dto as any);

      expect(prisma.alertRule.update).toHaveBeenCalledWith({
        where: { id },
        data: expect.objectContaining({ threshold: 75, enabled: false }),
      });
      expect(result).toEqual(updated);
    });
  });

  describe('deleteAlertRule()', () => {
    it('should delete an alert rule', async () => {
      const id = 'rule-1';
      const deleted = { id, projectId, metric: 'COVERAGE_PCT' };

      prisma.alertRule.delete.mockResolvedValue(deleted);

      const result = await service.deleteAlertRule(id);

      expect(prisma.alertRule.delete).toHaveBeenCalledWith({ where: { id } });
      expect(result).toEqual(deleted);
    });
  });

  describe('getAlertRules()', () => {
    it('should list alert rules for a project', async () => {
      const rules = [
        { id: 'rule-1', projectId, metric: 'COVERAGE_PCT', condition: 'LESS_THAN', threshold: 80 },
        { id: 'rule-2', projectId, metric: 'FLAKY_RATE', condition: 'GREATER_THAN', threshold: 10 },
      ];

      prisma.alertRule.findMany.mockResolvedValue(rules);

      const result = await service.getAlertRules(projectId);

      expect(prisma.alertRule.findMany).toHaveBeenCalledWith({
        where: { projectId },
      });
      expect(result).toEqual(rules);
    });
  });

  // ─── evaluateAlerts ────────────────────────────────────────

  describe('evaluateAlerts()', () => {
    const makeRule = (overrides: Record<string, any> = {}) => ({
      id: 'rule-1',
      projectId,
      metric: 'COVERAGE_PCT',
      condition: 'LESS_THAN',
      threshold: 80,
      channel: 'IN_APP',
      channelConfig: {},
      enabled: true,
      lastTriggered: null,
      createdAt: new Date(),
      ...overrides,
    });

    const makeSnapshot = (overrides: Record<string, any> = {}) => ({
      id: 'snap-1',
      projectId,
      metric: 'COVERAGE_PCT',
      value: 75,
      target: 90,
      recordedAt: new Date(),
      ...overrides,
    });

    it('should fetch enabled alert rules for the project', async () => {
      prisma.alertRule.findMany.mockResolvedValue([]);

      await service.evaluateAlerts(projectId);

      expect(prisma.alertRule.findMany).toHaveBeenCalledWith({
        where: { projectId, enabled: true },
      });
    });

    it('should not trigger when condition is not met (LESS_THAN, value >= threshold)', async () => {
      const rule = makeRule({ condition: 'LESS_THAN', threshold: 80 });
      const snapshot = makeSnapshot({ value: 85 });

      prisma.alertRule.findMany.mockResolvedValue([rule]);
      prisma.kPISnapshot.findMany.mockResolvedValue([snapshot]);

      await service.evaluateAlerts(projectId);

      expect(prisma.alertRule.update).not.toHaveBeenCalled();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('should trigger LESS_THAN when value < threshold', async () => {
      const rule = makeRule({ condition: 'LESS_THAN', threshold: 80, channel: 'IN_APP' });
      const snapshot = makeSnapshot({ value: 75 });

      prisma.alertRule.findMany.mockResolvedValue([rule]);
      prisma.kPISnapshot.findMany.mockResolvedValue([snapshot]);
      prisma.projectMember.findMany.mockResolvedValue([
        { userId: 'user-1' },
      ]);
      prisma.notification.create.mockResolvedValue({});
      prisma.alertRule.update.mockResolvedValue({});

      await service.evaluateAlerts(projectId);

      // Should update lastTriggered
      expect(prisma.alertRule.update).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
        data: { lastTriggered: expect.any(Date) },
      });
    });

    it('should trigger GREATER_THAN when value > threshold', async () => {
      const rule = makeRule({
        condition: 'GREATER_THAN',
        threshold: 5,
        metric: 'FLAKY_RATE',
        channel: 'IN_APP',
      });
      const snapshot = makeSnapshot({ metric: 'FLAKY_RATE', value: 12 });

      prisma.alertRule.findMany.mockResolvedValue([rule]);
      prisma.kPISnapshot.findMany.mockResolvedValue([snapshot]);
      prisma.projectMember.findMany.mockResolvedValue([
        { userId: 'user-1' },
      ]);
      prisma.notification.create.mockResolvedValue({});
      prisma.alertRule.update.mockResolvedValue({});

      await service.evaluateAlerts(projectId);

      expect(prisma.alertRule.update).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
        data: { lastTriggered: expect.any(Date) },
      });
    });

    it('should not trigger GREATER_THAN when value <= threshold', async () => {
      const rule = makeRule({
        condition: 'GREATER_THAN',
        threshold: 5,
        metric: 'FLAKY_RATE',
        channel: 'IN_APP',
      });
      const snapshot = makeSnapshot({ metric: 'FLAKY_RATE', value: 3 });

      prisma.alertRule.findMany.mockResolvedValue([rule]);
      prisma.kPISnapshot.findMany.mockResolvedValue([snapshot]);

      await service.evaluateAlerts(projectId);

      expect(prisma.alertRule.update).not.toHaveBeenCalled();
    });

    it('should trigger DELTA_PCT when % change exceeds threshold', async () => {
      const rule = makeRule({
        condition: 'DELTA_PCT',
        threshold: 10,
        channel: 'IN_APP',
      });

      // Two snapshots: latest = 60, previous = 80 => delta = -25%
      const snapshots = [
        makeSnapshot({ id: 'snap-latest', value: 60, recordedAt: new Date('2026-03-05') }),
        makeSnapshot({ id: 'snap-prev', value: 80, recordedAt: new Date('2026-03-04') }),
      ];

      prisma.alertRule.findMany.mockResolvedValue([rule]);
      prisma.kPISnapshot.findMany.mockResolvedValue(snapshots);
      prisma.projectMember.findMany.mockResolvedValue([{ userId: 'user-1' }]);
      prisma.notification.create.mockResolvedValue({});
      prisma.alertRule.update.mockResolvedValue({});

      await service.evaluateAlerts(projectId);

      expect(prisma.alertRule.update).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
        data: { lastTriggered: expect.any(Date) },
      });
    });

    it('should not trigger DELTA_PCT when % change is within threshold', async () => {
      const rule = makeRule({
        condition: 'DELTA_PCT',
        threshold: 10,
        channel: 'IN_APP',
      });

      // Two snapshots: latest = 82, previous = 80 => delta = 2.5%
      const snapshots = [
        makeSnapshot({ id: 'snap-latest', value: 82, recordedAt: new Date('2026-03-05') }),
        makeSnapshot({ id: 'snap-prev', value: 80, recordedAt: new Date('2026-03-04') }),
      ];

      prisma.alertRule.findMany.mockResolvedValue([rule]);
      prisma.kPISnapshot.findMany.mockResolvedValue(snapshots);

      await service.evaluateAlerts(projectId);

      expect(prisma.alertRule.update).not.toHaveBeenCalled();
    });

    it('should not trigger disabled rules', async () => {
      // evaluateAlerts fetches only enabled: true, so disabled rules never appear
      prisma.alertRule.findMany.mockResolvedValue([]);

      await service.evaluateAlerts(projectId);

      expect(prisma.alertRule.update).not.toHaveBeenCalled();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    // ─── Channel dispatching ──────────────────────────────────

    it('should create IN_APP notification for all project members', async () => {
      const rule = makeRule({ channel: 'IN_APP' });
      const snapshot = makeSnapshot({ value: 75 });

      prisma.alertRule.findMany.mockResolvedValue([rule]);
      prisma.kPISnapshot.findMany.mockResolvedValue([snapshot]);
      prisma.projectMember.findMany.mockResolvedValue([
        { userId: 'user-1' },
        { userId: 'user-2' },
      ]);
      prisma.notification.create.mockResolvedValue({});
      prisma.alertRule.update.mockResolvedValue({});

      await service.evaluateAlerts(projectId);

      // One notification per member
      expect(prisma.notification.create).toHaveBeenCalledTimes(2);
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          title: expect.stringContaining('COVERAGE_PCT'),
          body: expect.any(String),
        }),
      });
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-2',
          title: expect.stringContaining('COVERAGE_PCT'),
          body: expect.any(String),
        }),
      });
    });

    it('should dispatch to Slack webhook for SLACK channel', async () => {
      const webhookUrl = 'https://hooks.slack.com/services/xxx';
      const rule = makeRule({
        channel: 'SLACK',
        channelConfig: { webhookUrl },
      });
      const snapshot = makeSnapshot({ value: 75 });

      prisma.alertRule.findMany.mockResolvedValue([rule]);
      prisma.kPISnapshot.findMany.mockResolvedValue([snapshot]);
      prisma.alertRule.update.mockResolvedValue({});

      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);

      await service.evaluateAlerts(projectId);

      expect(fetchMock).toHaveBeenCalledWith(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('COVERAGE_PCT'),
        signal: expect.any(AbortSignal),
      });
    });

    it('should dispatch email for EMAIL channel', async () => {
      const rule = makeRule({
        channel: 'EMAIL',
        channelConfig: { to: 'admin@example.com' },
      });
      const snapshot = makeSnapshot({ value: 75 });

      prisma.alertRule.findMany.mockResolvedValue([rule]);
      prisma.kPISnapshot.findMany.mockResolvedValue([snapshot]);
      prisma.alertRule.update.mockResolvedValue({});

      // Spy on the private dispatchEmail method
      const emailSpy = vi.spyOn(service as any, 'dispatchEmail');

      await service.evaluateAlerts(projectId);

      expect(emailSpy).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'EMAIL' }),
        'COVERAGE_PCT',
        75,
      );
    });

    // ─── lastTriggered update ─────────────────────────────────

    it('should update lastTriggered timestamp on the AlertRule after triggering', async () => {
      const rule = makeRule({ channel: 'IN_APP' });
      const snapshot = makeSnapshot({ value: 75 });

      prisma.alertRule.findMany.mockResolvedValue([rule]);
      prisma.kPISnapshot.findMany.mockResolvedValue([snapshot]);
      prisma.projectMember.findMany.mockResolvedValue([{ userId: 'user-1' }]);
      prisma.notification.create.mockResolvedValue({});
      prisma.alertRule.update.mockResolvedValue({});

      const before = new Date();
      await service.evaluateAlerts(projectId);
      const after = new Date();

      const updateCall = prisma.alertRule.update.mock.calls[0][0];
      expect(updateCall.where).toEqual({ id: 'rule-1' });
      const triggered = updateCall.data.lastTriggered as Date;
      expect(triggered.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(triggered.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    // ─── Cooldown ─────────────────────────────────────────────

    it('should not re-trigger if lastTriggered is within 1 hour (cooldown)', async () => {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      const rule = makeRule({
        channel: 'IN_APP',
        lastTriggered: thirtyMinutesAgo,
      });
      const snapshot = makeSnapshot({ value: 75 });

      prisma.alertRule.findMany.mockResolvedValue([rule]);
      prisma.kPISnapshot.findMany.mockResolvedValue([snapshot]);

      await service.evaluateAlerts(projectId);

      // Should NOT trigger due to cooldown
      expect(prisma.alertRule.update).not.toHaveBeenCalled();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('should re-trigger if lastTriggered is older than 1 hour', async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const rule = makeRule({
        channel: 'IN_APP',
        lastTriggered: twoHoursAgo,
      });
      const snapshot = makeSnapshot({ value: 75 });

      prisma.alertRule.findMany.mockResolvedValue([rule]);
      prisma.kPISnapshot.findMany.mockResolvedValue([snapshot]);
      prisma.projectMember.findMany.mockResolvedValue([{ userId: 'user-1' }]);
      prisma.notification.create.mockResolvedValue({});
      prisma.alertRule.update.mockResolvedValue({});

      await service.evaluateAlerts(projectId);

      expect(prisma.alertRule.update).toHaveBeenCalled();
    });

    it('should skip evaluation when no snapshot exists for the metric', async () => {
      const rule = makeRule();
      prisma.alertRule.findMany.mockResolvedValue([rule]);
      prisma.kPISnapshot.findMany.mockResolvedValue([]);

      await service.evaluateAlerts(projectId);

      expect(prisma.alertRule.update).not.toHaveBeenCalled();
    });
  });
});
