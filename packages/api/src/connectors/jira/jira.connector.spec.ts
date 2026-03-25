import nock from 'nock';
import { JiraConnector } from './jira.connector';
import type {
  ConnectorConfig,
  NormalizedDefect,
} from '@qod/shared';

const BASE_URL = 'https://test.atlassian.net';

function makeConfig(overrides: Partial<ConnectorConfig['credentials']> = {}): ConnectorConfig {
  return {
    id: 'jira-1',
    connectorType: 'jira',
    credentials: {
      baseUrl: BASE_URL,
      email: 'user@example.com',
      apiToken: 'test-token',
      projectKey: 'PROJ',
      ...overrides,
    },
    fieldMapping: {},
    syncSchedule: '*/15 * * * *',
  };
}

function expectedAuthHeader(): string {
  return 'Basic ' + Buffer.from('user@example.com:test-token').toString('base64');
}

describe('JiraConnector', () => {
  let connector: JiraConnector;

  beforeEach(() => {
    connector = new JiraConnector();
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should have correct name and type', () => {
    expect(connector.name).toBe('jira');
    expect(connector.type).toBe('issue_tracker');
  });

  // ── authenticate ──────────────────────────────────────────────────────

  describe('authenticate', () => {
    it('should return success on 200', async () => {
      const scope = nock(BASE_URL)
        .get('/rest/api/3/myself')
        .matchHeader('Authorization', expectedAuthHeader())
        .reply(200, { accountId: '123', displayName: 'Test User' });

      const result = await connector.authenticate(makeConfig());

      expect(result.success).toBe(true);
      expect(result.metadata).toEqual({ accountId: '123', displayName: 'Test User' });
      scope.done();
    });

    it('should return failure on 401', async () => {
      const scope = nock(BASE_URL)
        .get('/rest/api/3/myself')
        .reply(401, { message: 'Unauthorized' });

      const result = await connector.authenticate(makeConfig());

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      scope.done();
    });

    it('should return failure on network error', async () => {
      const scope = nock(BASE_URL)
        .get('/rest/api/3/myself')
        .replyWithError('ECONNREFUSED');

      const result = await connector.authenticate(makeConfig());

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      scope.done();
    });
  });

  // ── testConnection ────────────────────────────────────────────────────

  describe('testConnection', () => {
    it('should return success on 200', async () => {
      const scope = nock(BASE_URL)
        .get('/rest/api/3/myself')
        .reply(200, { accountId: '456', displayName: 'Another User' });

      const result = await connector.testConnection(makeConfig());

      expect(result.success).toBe(true);
      scope.done();
    });

    it('should return failure on 403', async () => {
      const scope = nock(BASE_URL)
        .get('/rest/api/3/myself')
        .reply(403, { message: 'Forbidden' });

      const result = await connector.testConnection(makeConfig());

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      scope.done();
    });
  });

  // ── fetchDefects ──────────────────────────────────────────────────────

  describe('fetchDefects', () => {
    const issueFixture = (overrides: Record<string, any> = {}) => ({
      key: 'PROJ-101',
      fields: {
        summary: 'Login button broken',
        priority: { name: 'High' },
        status: { name: 'In Progress' },
        components: [{ name: 'Auth' }],
        labels: ['production'],
        environment: null,
        created: '2025-01-15T10:00:00.000Z',
        resolutiondate: null,
        assignee: { displayName: 'Jane Doe' },
        ...overrides,
      },
      changelog: {
        histories: [
          {
            created: '2025-01-16T12:00:00.000Z',
            author: { displayName: 'Jane Doe' },
            items: [
              { field: 'status', fromString: 'Open', toString: 'In Progress' },
            ],
          },
        ],
      },
    });

    // fetchDefects verifies credentials via /myself before querying
    let authScope: nock.Scope;
    beforeEach(() => {
      authScope = nock(BASE_URL)
        .get('/rest/api/3/myself')
        .reply(200, { accountId: '1', displayName: 'User' })
        .persist();
    });
    afterEach(() => { authScope.persist(false); });

    function mockSearch(issues: any[], opts?: { isLast?: boolean; nextPageToken?: string }) {
      return nock(BASE_URL)
        .get('/rest/api/3/search/jql')
        .query(true)
        .reply(200, {
          issues,
          isLast: opts?.isLast ?? true,
          ...(opts?.nextPageToken ? { nextPageToken: opts.nextPageToken } : {}),
        });
    }

    it('should use default JQL when no custom jql provided', async () => {
      const scope = nock(BASE_URL)
        .get('/rest/api/3/search/jql')
        .query((q: any) => q.jql === 'project = "PROJ" AND issuetype = "Bug"')
        .reply(200, { issues: [], isLast: true });

      await connector.fetchDefects!(makeConfig());
      scope.done();
    });

    it('should use custom JQL from config when provided', async () => {
      const scope = nock(BASE_URL)
        .get('/rest/api/3/search/jql')
        .query((q: any) => q.jql === 'project = PROJ AND issuetype = Bug AND priority = High')
        .reply(200, { issues: [], isLast: true });

      await connector.fetchDefects!(
        makeConfig({ jql: 'project = PROJ AND issuetype = Bug AND priority = High' }),
      );
      scope.done();
    });

    it('should append since filter to JQL in "yyyy-MM-dd HH:mm" format with 1-min buffer', async () => {
      const since = new Date('2025-06-01T00:05:00.000Z');
      // Expect 1-minute buffer: 00:05 → 00:04, no seconds in output
      const scope = nock(BASE_URL)
        .get('/rest/api/3/search/jql')
        .query((q: any) => q.jql.includes('AND updated >= "2025-06-01 00:04"'))
        .reply(200, { issues: [], isLast: true });

      await connector.fetchDefects!(makeConfig(), since);
      scope.done();
    });

    it('should request expand=changelog', async () => {
      const scope = nock(BASE_URL)
        .get('/rest/api/3/search/jql')
        .query((q: any) => q.expand === 'changelog')
        .reply(200, { issues: [], isLast: true });

      await connector.fetchDefects!(makeConfig());
      scope.done();
    });

    it('should send Basic Auth header', async () => {
      const scope = nock(BASE_URL)
        .get('/rest/api/3/search/jql')
        .query(true)
        .matchHeader('Authorization', expectedAuthHeader())
        .reply(200, { issues: [], isLast: true });

      await connector.fetchDefects!(makeConfig());
      scope.done();
    });

    it('should map a Jira issue to NormalizedDefect', async () => {
      const scope = mockSearch([issueFixture()]);

      const defects = await connector.fetchDefects!(makeConfig());

      expect(defects).toHaveLength(1);
      const d = defects[0];
      expect(d.externalId).toBe('PROJ-101');
      expect(d.title).toBe('Login button broken');
      expect(d.url).toBe('https://test.atlassian.net/browse/PROJ-101');
      expect(d.severity).toBe('HIGH');
      expect(d.priority).toBe('P1');
      expect(d.status).toBe('IN_PROGRESS');
      expect(d.component).toBe('Auth');
      expect(d.assignee).toBe('Jane Doe');
      expect(d.isEscaped).toBe(true);
      expect(d.createdAt).toEqual(new Date('2025-01-15T10:00:00.000Z'));
      expect(d.resolvedAt).toBeUndefined();
      scope.done();
    });

    // ── severity mapping ────────────────────────────────────────────────

    it.each([
      ['Highest', 'CRITICAL'],
      ['Critical', 'CRITICAL'],
      ['High', 'HIGH'],
      ['Medium', 'MEDIUM'],
      ['Low', 'LOW'],
      ['Lowest', 'LOW'],
    ])('should map priority "%s" to severity "%s"', async (jiraPriority, expectedSeverity) => {
      const scope = mockSearch([
        issueFixture({ priority: { name: jiraPriority } }),
      ]);

      const defects = await connector.fetchDefects!(makeConfig());
      expect(defects[0].severity).toBe(expectedSeverity);
      scope.done();
    });

    // ── priority mapping ────────────────────────────────────────────────

    it.each([
      ['Highest', 'P0'],
      ['Critical', 'P0'],
      ['High', 'P1'],
      ['Medium', 'P2'],
      ['Low', 'P3'],
      ['Lowest', 'P3'],
    ])('should map priority "%s" to QOD priority "%s"', async (jiraPriority, expectedPriority) => {
      const scope = mockSearch([
        issueFixture({ priority: { name: jiraPriority } }),
      ]);

      const defects = await connector.fetchDefects!(makeConfig());
      expect(defects[0].priority).toBe(expectedPriority);
      scope.done();
    });

    // ── status mapping ──────────────────────────────────────────────────

    it.each([
      ['To Do', 'OPEN'],
      ['Open', 'OPEN'],
      ['In Progress', 'IN_PROGRESS'],
      ['Done', 'CLOSED'],
      ['Closed', 'CLOSED'],
      ['Resolved', 'RESOLVED'],
      ['Reopened', 'REOPENED'],
    ])('should map Jira status "%s" to "%s"', async (jiraStatus, expectedStatus) => {
      const scope = mockSearch([
        issueFixture({ status: { name: jiraStatus } }),
      ]);

      const defects = await connector.fetchDefects!(makeConfig());
      expect(defects[0].status).toBe(expectedStatus);
      scope.done();
    });

    // ── component ───────────────────────────────────────────────────────

    it('should set component to null when no components', async () => {
      const scope = mockSearch([
        issueFixture({ components: [] }),
      ]);

      const defects = await connector.fetchDefects!(makeConfig());
      expect(defects[0].component).toBeUndefined();
      scope.done();
    });

    it('should use first component name', async () => {
      const scope = mockSearch([
        issueFixture({ components: [{ name: 'Frontend' }, { name: 'Backend' }] }),
      ]);

      const defects = await connector.fetchDefects!(makeConfig());
      expect(defects[0].component).toBe('Frontend');
      scope.done();
    });

    // ── isEscaped ───────────────────────────────────────────────────────

    it('should set isEscaped=true when "production" is in labels', async () => {
      const scope = mockSearch([
        issueFixture({ labels: ['production', 'urgent'], environment: null }),
      ]);

      const defects = await connector.fetchDefects!(makeConfig());
      expect(defects[0].isEscaped).toBe(true);
      scope.done();
    });

    it('should set isEscaped=true when "production" is in environment field', async () => {
      const scope = mockSearch([
        issueFixture({ labels: [], environment: 'production-us-east' }),
      ]);

      const defects = await connector.fetchDefects!(makeConfig());
      expect(defects[0].isEscaped).toBe(true);
      scope.done();
    });

    it('should set isEscaped=false when no production indicators', async () => {
      const scope = mockSearch([
        issueFixture({ labels: ['staging'], environment: 'dev' }),
      ]);

      const defects = await connector.fetchDefects!(makeConfig());
      expect(defects[0].isEscaped).toBe(false);
      scope.done();
    });

    it('should use custom escapedLabel from credentials to detect escaped defects', async () => {
      const scope = mockSearch([
        issueFixture({ labels: ['found-in-prod', 'urgent'], environment: null }),
      ]);

      const defects = await connector.fetchDefects!(makeConfig({ escapedLabel: 'found-in-prod' }));
      expect(defects[0].isEscaped).toBe(true);
      scope.done();
    });

    it('should not match default "production" when custom escapedLabel is set', async () => {
      const scope = mockSearch([
        issueFixture({ labels: ['production'], environment: null }),
      ]);

      const defects = await connector.fetchDefects!(makeConfig({ escapedLabel: 'escaped' }));
      expect(defects[0].isEscaped).toBe(false);
      scope.done();
    });

    // ── reopenCount ─────────────────────────────────────────────────────

    it('should count transitions to Reopened in changelog', async () => {
      const issue = issueFixture();
      issue.changelog.histories = [
        {
          created: '2025-01-16T12:00:00.000Z',
          author: { displayName: 'Jane' },
          items: [{ field: 'status', fromString: 'Open', toString: 'In Progress' }],
        },
        {
          created: '2025-01-17T12:00:00.000Z',
          author: { displayName: 'Jane' },
          items: [{ field: 'status', fromString: 'In Progress', toString: 'Reopened' }],
        },
        {
          created: '2025-01-18T12:00:00.000Z',
          author: { displayName: 'Jane' },
          items: [{ field: 'status', fromString: 'Reopened', toString: 'In Progress' }],
        },
        {
          created: '2025-01-19T12:00:00.000Z',
          author: { displayName: 'Jane' },
          items: [{ field: 'status', fromString: 'In Progress', toString: 'Reopened' }],
        },
      ];

      const scope = mockSearch([issue]);
      const defects = await connector.fetchDefects!(makeConfig());
      expect(defects[0].reopenCount).toBe(2);
      scope.done();
    });

    it('should return reopenCount=0 when no reopens in changelog', async () => {
      const scope = mockSearch([issueFixture()]);
      const defects = await connector.fetchDefects!(makeConfig());
      expect(defects[0].reopenCount).toBe(0);
      scope.done();
    });

    // ── resolvedAt ──────────────────────────────────────────────────────

    it('should map resolvedAt from resolutiondate', async () => {
      const scope = mockSearch([
        issueFixture({ resolutiondate: '2025-02-01T15:00:00.000Z' }),
      ]);

      const defects = await connector.fetchDefects!(makeConfig());
      expect(defects[0].resolvedAt).toEqual(new Date('2025-02-01T15:00:00.000Z'));
      scope.done();
    });

    // ── changelog ───────────────────────────────────────────────────────

    it('should build changelog from status transitions in histories', async () => {
      const issue = issueFixture();
      issue.changelog.histories = [
        {
          created: '2025-01-16T12:00:00.000Z',
          author: { displayName: 'Jane' },
          items: [
            { field: 'status', fromString: 'Open', toString: 'In Progress' },
            { field: 'assignee', fromString: null, toString: 'Jane' }, // non-status, ignored
          ],
        },
        {
          created: '2025-01-17T14:00:00.000Z',
          author: { displayName: 'Bob' },
          items: [
            { field: 'status', fromString: 'In Progress', toString: 'Resolved' },
          ],
        },
      ];

      const scope = mockSearch([issue]);
      const defects = await connector.fetchDefects!(makeConfig());
      const cl = defects[0].changelog;

      expect(cl).toHaveLength(2);
      expect(cl[0]).toEqual({
        from: 'Open',
        to: 'In Progress',
        at: new Date('2025-01-16T12:00:00.000Z'),
        by: 'Jane',
      });
      expect(cl[1]).toEqual({
        from: 'In Progress',
        to: 'Resolved',
        at: new Date('2025-01-17T14:00:00.000Z'),
        by: 'Bob',
      });
      scope.done();
    });

    it('should return empty changelog when no histories', async () => {
      const issue = issueFixture();
      issue.changelog.histories = [];

      const scope = mockSearch([issue]);
      const defects = await connector.fetchDefects!(makeConfig());
      expect(defects[0].changelog).toEqual([]);
      scope.done();
    });

    // ── pagination ──────────────────────────────────────────────────────

    it('should handle pagination across multiple pages', async () => {
      const issue1 = { ...issueFixture(), key: 'PROJ-1' };
      const issue2 = { ...issueFixture(), key: 'PROJ-2' };
      const issue3 = { ...issueFixture(), key: 'PROJ-3' };

      // Page 1: returns 2 issues with nextPageToken
      const scope1 = nock(BASE_URL)
        .get('/rest/api/3/search/jql')
        .query((q: any) => !q.nextPageToken)
        .reply(200, {
          issues: [issue1, issue2],
          isLast: false,
          nextPageToken: 'page2token',
        });

      // Page 2: returns 1 issue, isLast=true
      const scope2 = nock(BASE_URL)
        .get('/rest/api/3/search/jql')
        .query((q: any) => q.nextPageToken === 'page2token')
        .reply(200, {
          issues: [issue3],
          isLast: true,
        });

      const defects = await connector.fetchDefects!(makeConfig());

      expect(defects).toHaveLength(3);
      expect(defects[0].externalId).toBe('PROJ-1');
      expect(defects[1].externalId).toBe('PROJ-2');
      expect(defects[2].externalId).toBe('PROJ-3');
      scope1.done();
      scope2.done();
    });

    // ── edge cases ──────────────────────────────────────────────────────

    it('should handle issue with no assignee', async () => {
      const scope = mockSearch([
        issueFixture({ assignee: null }),
      ]);

      const defects = await connector.fetchDefects!(makeConfig());
      expect(defects[0].assignee).toBeUndefined();
      scope.done();
    });

    it('should map known priority names case-insensitively', async () => {
      const scope = mockSearch([
        issueFixture({ priority: { name: 'Blocker' } }),
      ]);

      const defects = await connector.fetchDefects!(makeConfig());
      expect(defects[0].severity).toBe('CRITICAL');
      expect(defects[0].priority).toBe('P0');
      scope.done();
    });

    it('should handle issue with unknown priority', async () => {
      const scope = mockSearch([
        issueFixture({ priority: { name: 'Urgentissimo' } }),
      ]);

      const defects = await connector.fetchDefects!(makeConfig());
      // truly unknown priorities default to MEDIUM/P2
      expect(defects[0].severity).toBe('MEDIUM');
      expect(defects[0].priority).toBe('P2');
      scope.done();
    });

    it('should handle issue with unknown status', async () => {
      const scope = mockSearch([
        issueFixture({ status: { name: 'Custom Status' } }),
      ]);

      const defects = await connector.fetchDefects!(makeConfig());
      // unknown statuses default to OPEN
      expect(defects[0].status).toBe('OPEN');
      scope.done();
    });

    it('should throw when API token is expired (401 from /myself)', async () => {
      // Override the persistent auth mock for this test
      authScope.persist(false);
      nock.cleanAll();
      nock(BASE_URL)
        .get('/rest/api/3/myself')
        .reply(401, { message: 'Unauthorized' });

      await expect(connector.fetchDefects!(makeConfig())).rejects.toThrow(
        /Jira authentication failed.*401/,
      );
    });
  });
});
