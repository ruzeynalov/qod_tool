import type {
  IQODConnector,
  ConnectorConfig,
  ConnectorCategory,
  AuthResult,
  NormalizedStory,
  NormalizedEpic,
} from '@qod/shared';
import {
  getCredentials,
  jiraFetch,
  authenticate as jiraAuthenticate,
  sanitizeProjectKey,
  verifyCredentials,
  formatSinceForJQL,
} from '../jira/jira-base';

// ── Status mapping ──────────────────────────────────────────────────

// Keys are lowercase for case-insensitive lookup.
const STATUS_MAP: Record<string, NormalizedStory['status']> = {
  'to do': 'OPEN',
  open: 'OPEN',
  new: 'OPEN',
  backlog: 'OPEN',
  'in progress': 'IN_PROGRESS',
  'in review': 'IN_PROGRESS',
  'in development': 'IN_PROGRESS',
  done: 'CLOSED',
  closed: 'CLOSED',
  resolved: 'RESOLVED',
  fixed: 'RESOLVED',
  reopened: 'REOPENED',
};

// ── Connector ───────────────────────────────────────────────────────

export class JiraStoriesConnector implements IQODConnector {
  readonly name = 'jira_stories';
  readonly type: ConnectorCategory = 'issue_tracker';

  async authenticate(config: ConnectorConfig): Promise<AuthResult> {
    return jiraAuthenticate(config);
  }

  async testConnection(config: ConnectorConfig): Promise<AuthResult> {
    return this.authenticate(config);
  }

  async fetchStories(config: ConnectorConfig, since?: Date): Promise<NormalizedStory[]> {
    const creds = getCredentials(config);
    const raw = config.credentials as Record<string, string>;
    const storyIssueType = raw.storyIssueType || 'Story';
    const storyPointsField = raw.storyPointsField || 'customfield_10016';
    await verifyCredentials(creds);

    const sanitizedKey = sanitizeProjectKey(creds.projectKey);
    let jql = creds.jql
      ?? (sanitizedKey ? `project = "${sanitizedKey}" AND issuetype = ${storyIssueType}` : `issuetype = ${storyIssueType}`);

    if (since) {
      jql += ` AND updated >= "${formatSinceForJQL(since)}"`;
    }

    const allStories: NormalizedStory[] = [];
    const maxResults = 50;
    let nextPageToken: string | undefined;

    while (true) {
      const params = new URLSearchParams({
        jql,
        maxResults: String(maxResults),
        fields: `summary,priority,status,components,labels,created,resolutiondate,assignee,${storyPointsField},parent`,
      });
      if (nextPageToken) {
        params.set('nextPageToken', nextPageToken);
      }
      const res = await jiraFetch(creds, `/rest/api/3/search/jql?${params}`);

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`Jira API error (HTTP ${res.status}): ${errorBody}`);
      }

      const data = await res.json() as {
        issues: any[];
        nextPageToken?: string;
        isLast?: boolean;
      };

      if (!Array.isArray(data.issues)) {
        throw new Error(`Unexpected Jira response: ${JSON.stringify(data).slice(0, 500)}`);
      }

      for (const issue of data.issues) {
        const epicType = raw.epicIssueType || 'Epic';
        allStories.push(mapIssueToStory(issue, creds.baseUrl, storyPointsField, epicType));
      }

      if (data.isLast || !data.nextPageToken || data.issues.length === 0) break;
      nextPageToken = data.nextPageToken;
    }

    return allStories;
  }

  async fetchEpics(config: ConnectorConfig): Promise<NormalizedEpic[]> {
    const creds = getCredentials(config);
    const raw = config.credentials as Record<string, string>;
    const epicIssueType = raw.epicIssueType || 'Epic';
    await verifyCredentials(creds);

    const sanitizedKey = sanitizeProjectKey(creds.projectKey);
    const jql = sanitizedKey
      ? `project = "${sanitizedKey}" AND issuetype = ${epicIssueType}`
      : `issuetype = ${epicIssueType}`;

    const allEpics: NormalizedEpic[] = [];
    const maxResults = 50;
    let nextPageToken: string | undefined;

    while (true) {
      const params = new URLSearchParams({
        jql,
        maxResults: String(maxResults),
        fields: 'summary,status',
      });
      if (nextPageToken) {
        params.set('nextPageToken', nextPageToken);
      }
      const res = await jiraFetch(creds, `/rest/api/3/search/jql?${params}`);

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`Jira API error (HTTP ${res.status}): ${errorBody}`);
      }

      const data = await res.json() as {
        issues: any[];
        nextPageToken?: string;
        isLast?: boolean;
      };

      if (!Array.isArray(data.issues)) break;

      for (const issue of data.issues) {
        allEpics.push({
          externalId: issue.key,
          title: issue.fields.summary,
          url: `${creds.baseUrl}/browse/${issue.key}`,
          status: issue.fields.status?.name ?? 'Open',
        });
      }

      if (data.isLast || !data.nextPageToken || data.issues.length === 0) break;
      nextPageToken = data.nextPageToken;
    }

    return allEpics;
  }
}

// ── Issue → NormalizedStory mapper ──────────────────────────────────

function mapIssueToStory(issue: any, baseUrl: string, storyPointsField: string = 'customfield_10016', epicIssueType: string = 'Epic'): NormalizedStory {
  const fields = issue.fields;
  const statusName: string = fields.status?.name ?? 'Open';
  const parent = fields.parent;
  const epicKey = parent?.fields?.issuetype?.name === epicIssueType ? parent.key : undefined;

  return {
    externalId: issue.key,
    title: fields.summary,
    url: `${baseUrl}/browse/${issue.key}`,
    status: STATUS_MAP[statusName.toLowerCase()] ?? 'OPEN',
    storyPoints: fields[storyPointsField] ?? undefined,
    assignee: fields.assignee?.displayName ?? undefined,
    component: fields.components?.length > 0 ? fields.components[0].name : undefined,
    labels: fields.labels ?? [],
    epicKey,
    createdAt: new Date(fields.created),
    resolvedAt: fields.resolutiondate ? new Date(fields.resolutiondate) : undefined,
  };
}
