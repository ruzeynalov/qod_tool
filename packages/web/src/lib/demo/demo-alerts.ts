export interface AlertRule {
  id: string;
  projectId: string;
  metric: string;
  condition: string;
  threshold: number;
  channel: string;
  channelConfig: Record<string, any>;
  enabled: boolean;
  lastTriggered: string | null;
  createdAt: string;
}

const METRICS = [
  'COVERAGE_PCT', 'PASS_RATE_7D', 'PASS_RATE_30D', 'FLAKY_RATE',
  'MTTD_HOURS', 'MTTR_HOURS', 'ESCAPE_RATE', 'EXEC_VELOCITY',
  'REQ_COVERAGE', 'READINESS_SCORE', 'DEFECT_DENSITY',
];

const CONDITIONS = ['LESS_THAN', 'GREATER_THAN', 'DELTA_PCT'];
const CHANNELS = ['IN_APP', 'SLACK'];

export function getDemoAlertRules(projectId: string): AlertRule[] {
  const rules: AlertRule[] = [
    {
      id: `${projectId}-alert-1`,
      projectId,
      metric: 'COVERAGE_PCT',
      condition: 'LESS_THAN',
      threshold: 80,
      channel: 'SLACK',
      channelConfig: { webhookUrl: 'https://hooks.slack.com/services/demo' },
      enabled: true,
      lastTriggered: new Date(Date.now() - 3600000).toISOString(),
      createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
    },
    {
      id: `${projectId}-alert-2`,
      projectId,
      metric: 'FLAKY_RATE',
      condition: 'GREATER_THAN',
      threshold: 10,
      channel: 'IN_APP',
      channelConfig: {},
      enabled: true,
      lastTriggered: null,
      createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
    },
    {
      id: `${projectId}-alert-3`,
      projectId,
      metric: 'PASS_RATE_7D',
      condition: 'LESS_THAN',
      threshold: 90,
      channel: 'EMAIL',
      channelConfig: {},
      enabled: false,
      lastTriggered: new Date(Date.now() - 86400000 * 2).toISOString(),
      createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    },
    {
      id: `${projectId}-alert-4`,
      projectId,
      metric: 'ESCAPE_RATE',
      condition: 'GREATER_THAN',
      threshold: 5,
      channel: 'SLACK',
      channelConfig: { webhookUrl: 'https://hooks.slack.com/services/demo2' },
      enabled: true,
      lastTriggered: null,
      createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    },
  ];
  return rules;
}

export { METRICS, CONDITIONS, CHANNELS };
