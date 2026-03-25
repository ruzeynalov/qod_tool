import type {
  IQODConnector,
  ConnectorConfig,
  ConnectorCategory,
  AuthResult,
  NormalizedDefect,
  StateTransition,
} from '@qod/shared';
import {
  getCredentials,
  jiraFetch,
  authenticate as jiraAuthenticate,
  sanitizeProjectKey,
  verifyCredentials,
  formatSinceForJQL,
} from './jira-base';

// ── Severity / Priority / Status mappings ─────────────────────────────
// Keys are lowercase for case-insensitive lookup.

const SEVERITY_MAP: Record<string, NormalizedDefect['severity']> = {
  highest: 'CRITICAL',
  critical: 'CRITICAL',
  blocker: 'CRITICAL',
  high: 'HIGH',
  major: 'HIGH',
  medium: 'MEDIUM',
  normal: 'MEDIUM',
  minor: 'LOW',
  low: 'LOW',
  lowest: 'LOW',
  trivial: 'LOW',
};

const PRIORITY_MAP: Record<string, NormalizedDefect['priority']> = {
  highest: 'P0',
  critical: 'P0',
  blocker: 'P0',
  high: 'P1',
  major: 'P1',
  medium: 'P2',
  normal: 'P2',
  low: 'P3',
  minor: 'P3',
  lowest: 'P3',
  trivial: 'P3',
};

const STATUS_MAP: Record<string, NormalizedDefect['status']> = {
  'to do': 'OPEN',
  open: 'OPEN',
  new: 'OPEN',
  backlog: 'OPEN',
  created: 'OPEN',
  'in progress': 'IN_PROGRESS',
  'in review': 'IN_PROGRESS',
  'in development': 'IN_PROGRESS',
  'code review': 'IN_PROGRESS',
  'qa testing': 'IN_PROGRESS',
  'in testing': 'IN_PROGRESS',
  'under review': 'IN_PROGRESS',
  done: 'CLOSED',
  closed: 'CLOSED',
  verified: 'CLOSED',
  released: 'CLOSED',
  resolved: 'RESOLVED',
  fixed: 'RESOLVED',
  'won\'t fix': 'RESOLVED',
  'won\'t do': 'RESOLVED',
  duplicate: 'RESOLVED',
  reopened: 'REOPENED',
  'reopen': 'REOPENED',
};

// ── Connector ───────────────────────────────────────────────────────────

export class JiraConnector implements IQODConnector {
  readonly name = 'jira';
  readonly type: ConnectorCategory = 'issue_tracker';

  async authenticate(config: ConnectorConfig): Promise<AuthResult> {
    return jiraAuthenticate(config);
  }

  async testConnection(config: ConnectorConfig): Promise<AuthResult> {
    return this.authenticate(config);
  }

  async fetchDefects(config: ConnectorConfig, since?: Date): Promise<NormalizedDefect[]> {
    const creds = getCredentials(config);
    const raw = config.credentials as Record<string, string>;
    const issueType = raw.issueType || 'Bug';

    // Pre-flight auth check — Jira may return HTTP 200 with empty results
    // when credentials expire, silently yielding 0 defects instead of an error.
    await verifyCredentials(creds);

    const sanitizedKey = sanitizeProjectKey(creds.projectKey);

    // Build issue type filter — supports comma-separated values (e.g. "Bug, Defect")
    const issueTypeFilter = issueType.includes(',')
      ? `issuetype in (${issueType})`
      : `issuetype = "${issueType}"`;

    let jql = creds.jql
      ?? (sanitizedKey ? `project = "${sanitizedKey}" AND ${issueTypeFilter}` : issueTypeFilter);

    if (since) {
      jql += ` AND updated >= "${formatSinceForJQL(since)}"`;
    }

    const allDefects: NormalizedDefect[] = [];
    const maxResults = 50;
    let nextPageToken: string | undefined;

    while (true) {
      const params = new URLSearchParams({
        jql,
        maxResults: String(maxResults),
        expand: 'changelog',
        fields: 'summary,priority,status,components,labels,environment,created,resolutiondate,assignee',
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
        allDefects.push(mapIssueToDefect(issue, creds.baseUrl, creds.escapedLabel));
      }

      if (data.isLast || !data.nextPageToken || data.issues.length === 0) break;
      nextPageToken = data.nextPageToken;
    }

    return allDefects;
  }
}

// ── Issue → NormalizedDefect mapper ────────────────────────────────────

function mapIssueToDefect(issue: any, baseUrl: string, escapedLabel?: string): NormalizedDefect {
  const fields = issue.fields;
  const priorityName: string = fields.priority?.name ?? 'Medium';
  const statusName: string = fields.status?.name ?? 'Open';

  const labels: string[] = fields.labels ?? [];
  const rawEnv = fields.environment;
  const environment: string | null =
    typeof rawEnv === 'string' ? rawEnv
    : rawEnv?.content ? JSON.stringify(rawEnv)
    : null;

  // A defect is "escaped" if it carries the configured label (defaults to
  // "production") or the environment field contains "production".
  const escapedTag = (escapedLabel || 'production').toLowerCase();
  const isEscaped =
    labels.some((l: string) => l.toLowerCase().includes(escapedTag)) ||
    (typeof environment === 'string' && environment.toLowerCase().includes(escapedTag));

  const histories: any[] = issue.changelog?.histories ?? [];
  const changelog: StateTransition[] = [];
  let reopenCount = 0;

  for (const history of histories) {
    for (const item of history.items) {
      if (item.field === 'status') {
        changelog.push({
          from: item.fromString,
          to: item.toString,
          at: new Date(history.created),
          by: history.author?.displayName,
        });
        if (item.toString === 'Reopened') {
          reopenCount++;
        }
      }
    }
  }

  return {
    externalId: issue.key,
    title: fields.summary,
    url: `${baseUrl}/browse/${issue.key}`,
    severity: SEVERITY_MAP[priorityName.toLowerCase()] ?? 'MEDIUM',
    priority: PRIORITY_MAP[priorityName.toLowerCase()] ?? 'P2',
    status: STATUS_MAP[statusName.toLowerCase()] ?? 'OPEN',
    component: fields.components?.length > 0 ? fields.components[0].name : undefined,
    assignee: fields.assignee?.displayName ?? undefined,
    labels,
    isEscaped,
    reopenCount,
    createdAt: new Date(fields.created),
    resolvedAt: fields.resolutiondate ? new Date(fields.resolutiondate) : undefined,
    changelog,
  };
}
