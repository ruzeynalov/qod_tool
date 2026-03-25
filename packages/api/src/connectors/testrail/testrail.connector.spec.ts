import nock from 'nock';
import { TestRailConnector } from './testrail.connector';
import type { ConnectorConfig } from '@qod/shared';

const BASE_URL = 'https://test.testrail.io';

const config: ConnectorConfig = {
  id: 'conn-1',
  connectorType: 'testrail',
  credentials: {
    baseUrl: BASE_URL,
    email: 'user@example.com',
    apiKey: 'test-api-key',
    projectId: '1',
  },
  fieldMapping: {},
  syncSchedule: '0 * * * *',
};

const expectedAuthHeader =
  'Basic ' + Buffer.from('user@example.com:test-api-key').toString('base64');

/** Mock an empty get_plans response (no test plans). */
function mockEmptyPlans(sinceUnix?: number) {
  const path = sinceUnix
    ? `/index.php?/api/v2/get_plans/1&created_after=${sinceUnix}&offset=0&limit=250`
    : '/index.php?/api/v2/get_plans/1&offset=0&limit=250';
  nock(BASE_URL).get(path).reply(200, {
    offset: 0, limit: 250, size: 0, _links: { next: null }, plans: [],
  });
}

describe('TestRailConnector', () => {
  let connector: TestRailConnector;

  beforeEach(() => {
    connector = new TestRailConnector();
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('metadata', () => {
    it('should have name "testrail"', () => {
      expect(connector.name).toBe('testrail');
    });

    it('should have type "tms"', () => {
      expect(connector.type).toBe('tms');
    });
  });

  describe('authenticate', () => {
    it('should return success on 200', async () => {
      const scope = nock(BASE_URL)
        .get('/index.php?/api/v2/get_user_by_email&email=user@example.com')
        .matchHeader('Authorization', expectedAuthHeader)
        .matchHeader('Content-Type', 'application/json')
        .reply(200, { id: 1, email: 'user@example.com', name: 'Test User' });

      const result = await connector.authenticate(config);

      expect(result.success).toBe(true);
      expect(result.metadata).toEqual({
        id: 1,
        email: 'user@example.com',
        name: 'Test User',
      });
      scope.done();
    });

    it('should return failure on 401', async () => {
      const scope = nock(BASE_URL)
        .get('/index.php?/api/v2/get_user_by_email&email=user@example.com')
        .reply(401, { error: 'Authentication failed.' });

      const result = await connector.authenticate(config);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      scope.done();
    });

    it('should return failure on network error', async () => {
      const scope = nock(BASE_URL)
        .get('/index.php?/api/v2/get_user_by_email&email=user@example.com')
        .replyWithError('Connection refused');

      const result = await connector.authenticate(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection refused');
      scope.done();
    });
  });

  describe('testConnection', () => {
    it('should behave the same as authenticate', async () => {
      const scope = nock(BASE_URL)
        .get('/index.php?/api/v2/get_user_by_email&email=user@example.com')
        .matchHeader('Authorization', expectedAuthHeader)
        .reply(200, { id: 1, email: 'user@example.com', name: 'Test User' });

      const result = await connector.testConnection(config);

      expect(result.success).toBe(true);
      scope.done();
    });
  });

  describe('fetchTestCases', () => {
    it('should fetch and normalize test cases', async () => {
      const scope = nock(BASE_URL)
        .get('/index.php?/api/v2/get_cases/1&offset=0&limit=250')
        .matchHeader('Authorization', expectedAuthHeader)
        .reply(200, {
          offset: 0,
          limit: 250,
          size: 2,
          _links: { next: null },
          cases: [
            {
              id: 101,
              title: 'Login with valid credentials',
              type_id: 1,
              section_id: 10,
              custom_automation_type: null,
              custom_labels: 'smoke,regression',
            },
            {
              id: 102,
              title: 'API endpoint returns 200',
              type_id: 3,
              section_id: 20,
              custom_automation_type: 1,
              custom_labels: 'api',
            },
          ],
        });

      const sectionsScope = nock(BASE_URL)
        .get('/index.php?/api/v2/get_sections/1&offset=0&limit=250')
        .reply(200, {
          offset: 0,
          limit: 250,
          size: 2,
          _links: { next: null },
          sections: [
            { id: 10, name: 'Login Tests' },
            { id: 20, name: 'API Tests' },
          ],
        });

      const cases = await connector.fetchTestCases(config);

      expect(cases).toHaveLength(2);

      expect(cases[0]).toEqual({
        externalId: '101',
        title: 'Login with valid credentials',
        type: 'MANUAL',
        automationStatus: 'NOT_AUTOMATED',
        suiteName: 'Login Tests',
        tags: ['smoke', 'regression'],
      });

      expect(cases[1]).toEqual({
        externalId: '102',
        title: 'API endpoint returns 200',
        type: 'AUTOMATED',
        automationStatus: 'AUTOMATED',
        suiteName: 'API Tests',
        tags: ['api'],
      });

      scope.done();
      sectionsScope.done();
    });

    it('should handle pagination', async () => {
      nock(BASE_URL)
        .get('/index.php?/api/v2/get_cases/1&offset=0&limit=250')
        .reply(200, {
          offset: 0,
          limit: 250,
          size: 250,
          _links: { next: '/api/v2/get_cases/1&offset=250&limit=250' },
          cases: [{ id: 1, title: 'Case 1', type_id: 1, section_id: 10 }],
        });

      nock(BASE_URL)
        .get('/index.php?/api/v2/get_cases/1&offset=250&limit=250')
        .reply(200, {
          offset: 250,
          limit: 250,
          size: 1,
          _links: { next: null },
          cases: [{ id: 2, title: 'Case 2', type_id: 3, section_id: 10 }],
        });

      nock(BASE_URL)
        .get('/index.php?/api/v2/get_sections/1&offset=0&limit=250')
        .reply(200, {
          offset: 0,
          limit: 250,
          size: 1,
          _links: { next: null },
          sections: [{ id: 10, name: 'Suite A' }],
        });

      const cases = await connector.fetchTestCases(config);

      expect(cases).toHaveLength(2);
      expect(cases[0].externalId).toBe('1');
      expect(cases[1].externalId).toBe('2');
    });

    it('should map type_id correctly (unknown type_id defaults to MANUAL)', async () => {
      nock(BASE_URL)
        .get('/index.php?/api/v2/get_cases/1&offset=0&limit=250')
        .reply(200, {
          offset: 0,
          limit: 250,
          size: 1,
          _links: { next: null },
          cases: [{ id: 200, title: 'Other type', type_id: 7, section_id: 10 }],
        });

      nock(BASE_URL)
        .get('/index.php?/api/v2/get_sections/1&offset=0&limit=250')
        .reply(200, {
          offset: 0,
          limit: 250,
          size: 1,
          _links: { next: null },
          sections: [{ id: 10, name: 'Misc' }],
        });

      const cases = await connector.fetchTestCases(config);

      expect(cases[0].type).toBe('MANUAL');
    });

    it('should detect automation from is_automated field when custom_automation_type is absent', async () => {
      nock(BASE_URL)
        .get('/index.php?/api/v2/get_cases/1&offset=0&limit=250')
        .reply(200, {
          offset: 0,
          limit: 250,
          size: 1,
          _links: { next: null },
          cases: [
            {
              id: 300,
              title: 'Auto via flag',
              type_id: 1,
              section_id: 10,
              is_automated: true,
            },
          ],
        });

      nock(BASE_URL)
        .get('/index.php?/api/v2/get_sections/1&offset=0&limit=250')
        .reply(200, {
          offset: 0,
          limit: 250,
          size: 1,
          _links: { next: null },
          sections: [{ id: 10, name: 'Auto' }],
        });

      const cases = await connector.fetchTestCases(config);

      expect(cases[0].automationStatus).toBe('AUTOMATED');
    });
  });

  describe('fetchTestRuns', () => {
    it('should fetch runs and their results', async () => {
      const since = new Date('2024-01-01T00:00:00Z');
      const sinceUnix = Math.floor(since.getTime() / 1000);

      mockEmptyPlans(sinceUnix);

      nock(BASE_URL)
        .get(`/index.php?/api/v2/get_runs/1&created_after=${sinceUnix}&offset=0&limit=250`)
        .matchHeader('Authorization', expectedAuthHeader)
        .reply(200, {
          offset: 0,
          limit: 250,
          size: 1,
          _links: { next: null },
          runs: [
            {
              id: 50,
              name: 'Sprint 1 Run',
              created_on: 1704067200, // 2024-01-01T00:00:00Z
              completed_on: 1704070800,
              is_completed: true,
            },
          ],
        });

      nock(BASE_URL)
        .get('/index.php?/api/v2/get_results_for_run/50&offset=0&limit=250')
        .reply(200, {
          offset: 0,
          limit: 250,
          size: 2,
          _links: { next: null },
          results: [
            {
              id: 1001,
              test_id: 101,
              case_id: 101,
              status_id: 1,
              elapsed: '1m 30s',
              comment: null,
              created_on: 1704067200,
            },
            {
              id: 1002,
              test_id: 102,
              case_id: 102,
              status_id: 5,
              elapsed: '45s',
              comment: 'Assertion error: expected 200 but got 500',
              created_on: 1704067260,
            },
          ],
        });

      // Fetch tests for run to get test titles
      nock(BASE_URL)
        .get('/index.php?/api/v2/get_tests/50&offset=0&limit=250')
        .reply(200, {
          offset: 0,
          limit: 250,
          size: 2,
          _links: { next: null },
          tests: [
            { id: 101, case_id: 101, title: 'Login with valid credentials' },
            { id: 102, case_id: 102, title: 'API endpoint returns 200' },
          ],
        });

      const runs = await connector.fetchTestRuns(config, since);

      expect(runs).toHaveLength(1);
      const run = runs[0];

      expect(run.externalId).toBe('50');
      expect(run.name).toBe('Sprint 1 Run');
      expect(run.triggerType).toBe('MANUAL');
      expect(run.startedAt).toEqual(new Date(1704067200 * 1000));
      expect(run.finishedAt).toEqual(new Date(1704070800 * 1000));
      expect(run.status).toBe('FAILED');

      expect(run.results).toHaveLength(2);

      expect(run.results[0]).toEqual({
        testExternalId: '101',
        testTitle: 'Login with valid credentials',
        status: 'PASSED',
        durationMs: 90000,
      });

      expect(run.results[1]).toEqual({
        testExternalId: '102',
        testTitle: 'API endpoint returns 200',
        status: 'FAILED',
        durationMs: 45000,
        errorMessage: 'Assertion error: expected 200 but got 500',
      });
    });

    it('should fetch runs without since parameter', async () => {
      mockEmptyPlans();

      nock(BASE_URL)
        .get('/index.php?/api/v2/get_runs/1&offset=0&limit=250')
        .reply(200, {
          offset: 0,
          limit: 250,
          size: 0,
          _links: { next: null },
          runs: [],
        });

      const runs = await connector.fetchTestRuns(config);

      expect(runs).toHaveLength(0);
    });

    it('should map all TestRail status IDs correctly', async () => {
      mockEmptyPlans();

      nock(BASE_URL)
        .get('/index.php?/api/v2/get_runs/1&offset=0&limit=250')
        .reply(200, {
          offset: 0,
          limit: 250,
          size: 1,
          _links: { next: null },
          runs: [
            {
              id: 60,
              name: 'Status Test Run',
              created_on: 1704067200,
              completed_on: 1704070800,
              is_completed: true,
            },
          ],
        });

      nock(BASE_URL)
        .get('/index.php?/api/v2/get_results_for_run/60&offset=0&limit=250')
        .reply(200, {
          offset: 0,
          limit: 250,
          size: 5,
          _links: { next: null },
          results: [
            { id: 1, test_id: 1, case_id: 1, status_id: 1, created_on: 1704067200 },
            { id: 2, test_id: 2, case_id: 2, status_id: 2, created_on: 1704067200 },
            { id: 3, test_id: 3, case_id: 3, status_id: 3, created_on: 1704067200 },
            { id: 4, test_id: 4, case_id: 4, status_id: 4, created_on: 1704067200 },
            { id: 5, test_id: 5, case_id: 5, status_id: 5, created_on: 1704067200 },
          ],
        });

      nock(BASE_URL)
        .get('/index.php?/api/v2/get_tests/60&offset=0&limit=250')
        .reply(200, {
          offset: 0,
          limit: 250,
          size: 5,
          _links: { next: null },
          tests: [
            { id: 1, case_id: 1, title: 'T1' },
            { id: 2, case_id: 2, title: 'T2' },
            { id: 3, case_id: 3, title: 'T3' },
            { id: 4, case_id: 4, title: 'T4' },
            { id: 5, case_id: 5, title: 'T5' },
          ],
        });

      const runs = await connector.fetchTestRuns(config);
      const statuses = runs[0].results.map((r) => r.status);

      expect(statuses).toEqual(['PASSED', 'SKIPPED', 'SKIPPED', 'FAILED', 'FAILED']);
    });

    it('should parse elapsed time formats correctly', async () => {
      mockEmptyPlans();

      nock(BASE_URL)
        .get('/index.php?/api/v2/get_runs/1&offset=0&limit=250')
        .reply(200, {
          offset: 0,
          limit: 250,
          size: 1,
          _links: { next: null },
          runs: [
            {
              id: 70,
              name: 'Elapsed Run',
              created_on: 1704067200,
              completed_on: null,
              is_completed: false,
            },
          ],
        });

      nock(BASE_URL)
        .get('/index.php?/api/v2/get_results_for_run/70&offset=0&limit=250')
        .reply(200, {
          offset: 0,
          limit: 250,
          size: 4,
          _links: { next: null },
          results: [
            { id: 1, test_id: 1, case_id: 1, status_id: 1, elapsed: '2h 30m 15s', created_on: 1704067200 },
            { id: 2, test_id: 2, case_id: 2, status_id: 1, elapsed: '5m', created_on: 1704067200 },
            { id: 3, test_id: 3, case_id: 3, status_id: 1, elapsed: '30s', created_on: 1704067200 },
            { id: 4, test_id: 4, case_id: 4, status_id: 1, elapsed: null, created_on: 1704067200 },
          ],
        });

      nock(BASE_URL)
        .get('/index.php?/api/v2/get_tests/70&offset=0&limit=250')
        .reply(200, {
          offset: 0,
          limit: 250,
          size: 4,
          _links: { next: null },
          tests: [
            { id: 1, case_id: 1, title: 'T1' },
            { id: 2, case_id: 2, title: 'T2' },
            { id: 3, case_id: 3, title: 'T3' },
            { id: 4, case_id: 4, title: 'T4' },
          ],
        });

      const runs = await connector.fetchTestRuns(config);
      const durations = runs[0].results.map((r) => r.durationMs);

      expect(durations[0]).toBe(2 * 3600000 + 30 * 60000 + 15 * 1000); // 9015000
      expect(durations[1]).toBe(5 * 60000); // 300000
      expect(durations[2]).toBe(30 * 1000); // 30000
      expect(durations[3]).toBeUndefined();
    });

    it('should determine run status based on results', async () => {
      mockEmptyPlans();

      nock(BASE_URL)
        .get('/index.php?/api/v2/get_runs/1&offset=0&limit=250')
        .reply(200, {
          offset: 0,
          limit: 250,
          size: 1,
          _links: { next: null },
          runs: [
            {
              id: 80,
              name: 'Failing Run',
              created_on: 1704067200,
              completed_on: 1704070800,
              is_completed: true,
            },
          ],
        });

      nock(BASE_URL)
        .get('/index.php?/api/v2/get_results_for_run/80&offset=0&limit=250')
        .reply(200, {
          offset: 0,
          limit: 250,
          size: 2,
          _links: { next: null },
          results: [
            { id: 1, test_id: 1, case_id: 1, status_id: 1, created_on: 1704067200 },
            { id: 2, test_id: 2, case_id: 2, status_id: 5, created_on: 1704067200 },
          ],
        });

      nock(BASE_URL)
        .get('/index.php?/api/v2/get_tests/80&offset=0&limit=250')
        .reply(200, {
          offset: 0,
          limit: 250,
          size: 2,
          _links: { next: null },
          tests: [
            { id: 1, case_id: 1, title: 'T1' },
            { id: 2, case_id: 2, title: 'T2' },
          ],
        });

      const runs = await connector.fetchTestRuns(config);

      expect(runs[0].status).toBe('FAILED');
    });
  });
});
