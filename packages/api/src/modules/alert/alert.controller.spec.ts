import { AlertController } from './alert.controller';
import { AlertService } from './alert.service';

describe('AlertController', () => {
  let controller: AlertController;
  let alertService: { [key: string]: ReturnType<typeof vi.fn> };

  const projectId = '00000000-0000-0000-0000-000000000001';
  const ruleId = '00000000-0000-0000-0000-000000000002';

  beforeEach(() => {
    alertService = {
      getAlertRules: vi.fn(),
      createAlertRule: vi.fn(),
      updateAlertRule: vi.fn(),
      deleteAlertRule: vi.fn(),
      evaluateAlerts: vi.fn(),
    };

    controller = new AlertController(alertService as unknown as AlertService);
  });

  describe('GET /', () => {
    it('should return alert rules for the project', async () => {
      const rules = [
        { id: ruleId, projectId, metric: 'COVERAGE_PCT', condition: 'LESS_THAN', threshold: 80 },
      ];
      alertService.getAlertRules.mockResolvedValue(rules);

      const result = await controller.getAlertRules(projectId);

      expect(alertService.getAlertRules).toHaveBeenCalledWith(projectId);
      expect(result).toEqual(rules);
    });
  });

  describe('POST /', () => {
    it('should create a new alert rule', async () => {
      const dto = {
        metric: 'COVERAGE_PCT',
        condition: 'LESS_THAN',
        threshold: 80,
        channel: 'SLACK',
        channelConfig: { webhookUrl: 'https://hooks.slack.com/xxx' },
      };
      const created = { id: ruleId, projectId, ...dto, enabled: true, lastTriggered: null };
      alertService.createAlertRule.mockResolvedValue(created);

      const result = await controller.createAlertRule(projectId, dto as any);

      expect(alertService.createAlertRule).toHaveBeenCalledWith(projectId, dto);
      expect(result).toEqual(created);
    });
  });

  describe('PATCH /:id', () => {
    it('should update an alert rule scoped to the project', async () => {
      const dto = { threshold: 75, enabled: false };
      const updated = {
        id: ruleId,
        projectId,
        metric: 'COVERAGE_PCT',
        condition: 'LESS_THAN',
        threshold: 75,
        channel: 'SLACK',
        enabled: false,
      };
      alertService.updateAlertRule.mockResolvedValue(updated);

      const result = await controller.updateAlertRule(projectId, ruleId, dto as any);

      expect(alertService.updateAlertRule).toHaveBeenCalledWith(projectId, ruleId, dto);
      expect(result).toEqual(updated);
    });
  });

  describe('DELETE /:id', () => {
    it('should delete an alert rule scoped to the project', async () => {
      const deleted = { id: ruleId, projectId, metric: 'COVERAGE_PCT' };
      alertService.deleteAlertRule.mockResolvedValue(deleted);

      const result = await controller.deleteAlertRule(projectId, ruleId);

      expect(alertService.deleteAlertRule).toHaveBeenCalledWith(projectId, ruleId);
      expect(result).toEqual(deleted);
    });
  });

  describe('POST /evaluate', () => {
    it('should trigger alert evaluation', async () => {
      alertService.evaluateAlerts.mockResolvedValue(undefined);

      const result = await controller.evaluateAlerts(projectId);

      expect(alertService.evaluateAlerts).toHaveBeenCalledWith(projectId);
      expect(result).toBeUndefined();
    });
  });
});
