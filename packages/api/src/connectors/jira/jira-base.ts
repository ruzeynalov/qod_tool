import type { ConnectorConfig, AuthResult } from '@qod/shared';

// ── Shared Jira types ───────────────────────────────────────────────

export interface JiraCredentials {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey?: string;
  jql?: string;
  escapedLabel?: string;
}

// ── Shared Jira helpers ────────────────────────────────────────────

export function getCredentials(config: ConnectorConfig): JiraCredentials {
  const raw = config.credentials as Record<string, string>;
  return {
    baseUrl: (raw.baseUrl || raw.url || '').replace(/\/+$/, ''),
    email: raw.email || raw.username || '',
    apiToken: raw.apiToken || raw.token || '',
    projectKey: raw.projectKey || raw.projectId || undefined,
    jql: raw.jql || undefined,
    escapedLabel: raw.escapedLabel || undefined,
  };
}

export function buildAuthHeader(creds: JiraCredentials): string {
  const encoded = Buffer.from(`${creds.email}:${creds.apiToken}`).toString('base64');
  return `Basic ${encoded}`;
}

export async function jiraFetch(
  creds: JiraCredentials,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `${creds.baseUrl}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      Authorization: buildAuthHeader(creds),
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    },
    signal: options.signal ?? AbortSignal.timeout(30_000),
  });
}

export async function authenticate(config: ConnectorConfig): Promise<AuthResult> {
  const creds = getCredentials(config);
  try {
    const res = await jiraFetch(creds, '/rest/api/3/myself');
    if (!res.ok) {
      return { success: false, error: `Authentication failed: HTTP ${res.status}` };
    }
    const data = await res.json();
    return { success: true, metadata: data as Record<string, unknown> };
  } catch (err: any) {
    return { success: false, error: err.message ?? String(err) };
  }
}

/**
 * Sanitize a Jira project key for safe use in JQL.
 * Strips any characters that are not alphanumeric, underscore, or hyphen.
 */
export function sanitizeProjectKey(projectKey: string | undefined): string | undefined {
  return projectKey ? projectKey.replace(/[^a-zA-Z0-9_-]/g, '') : undefined;
}

/**
 * Pre-flight credential check.  Jira may return HTTP 200 with empty
 * results when the API token has expired, silently yielding 0 records
 * instead of an error.  This call ensures we fail fast with a clear
 * message rather than reporting "0 fetched".
 */
export async function verifyCredentials(creds: JiraCredentials): Promise<void> {
  const res = await jiraFetch(creds, '/rest/api/3/myself');
  if (!res.ok) {
    throw new Error(
      `Jira authentication failed (HTTP ${res.status}). ` +
      'Please check that the API token is valid and has not expired.',
    );
  }
}

/**
 * Format a `since` Date into a JQL-compatible datetime string.
 * Jira JQL only supports `"yyyy-MM-dd HH:mm"` (no seconds).
 * A 1-minute buffer is subtracted to guard against clock skew.
 */
export function formatSinceForJQL(since: Date): string {
  const buffered = new Date(since.getTime() - 60_000);
  return buffered.toISOString().replace('T', ' ').replace(/:\d{2}\.\d{3}Z$/, '');
}
