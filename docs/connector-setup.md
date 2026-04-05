# Connector Setup Guide

QOD uses connectors to ingest data from external tools. Connectors are configured per-project via **Settings → Connectors** in the web UI. You can also import/export connector configs as JSON.

## Jira — Defects

### How to get credentials

1. Go to [https://id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Create a new API token

### Configuration fields

| Field | Description | Example |
|-------|-------------|---------|
| URL | Jira instance base URL | `https://acme-corp.atlassian.net` |
| Username | Email used for Jira login | `qa-lead@acme-corp.com` |
| Token | API token from step above | `ATATT3xFfGF0...your-token-here` |
| Project Key | Jira project key | `PROJ` |
| Issue Type | Issue type to fetch | `Bug` |
| Escaped Label | Label for escaped defects (optional) | `escaped-to-prod` |

### JSON export example

```json
{
  "connectorType": "JIRA",
  "name": "My Project Defects",
  "credentials": {
    "url": "https://acme-corp.atlassian.net/",
    "username": "qa-lead@acme-corp.com",
    "token": "ATATT3xFfGF0_placeholder_replace_with_real_token",
    "projectKey": "PROJ",
    "escapedLabel": "escaped-to-prod",
    "issueType": "Bug"
  },
  "fieldMapping": {},
  "syncSchedule": "0 0 * * *",
  "syncTimezone": "UTC"
}
```

## Jira — Stories & Epics

Uses the same authentication as Jira Defects (Atlassian API token). Additional fields:

| Field | Description | Example |
|-------|-------------|---------|
| Story Issue Type | Issue type for stories | `Story` |
| Epic Issue Type | Issue type for epics | `Epic` |
| Story Points Field | Custom field ID for story points | `customfield_10016` |

### JSON export example

```json
{
  "connectorType": "JIRA_STORIES",
  "name": "My Project Stories",
  "credentials": {
    "url": "https://acme-corp.atlassian.net/",
    "username": "qa-lead@acme-corp.com",
    "token": "ATATT3xFfGF0_placeholder_replace_with_real_token",
    "projectKey": "PROJ",
    "storyIssueType": "Story",
    "epicIssueType": "Epic",
    "storyPointsField": "customfield_10016"
  },
  "fieldMapping": {},
  "syncSchedule": "0 0 * * *",
  "syncTimezone": "UTC"
}
```

> **Tip**: To find the story points custom field ID, go to **Administration → Issues → Custom fields** in Jira and look for the "Story Points" field. Alternatively, use the Jira REST API: `GET /rest/api/3/field` and search for a field with `name` containing "Story Points" — the `id` value (e.g. `customfield_10016`) is what you need.

## GitHub Actions

### How to get a Personal Access Token (PAT)

1. Go to **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens**
2. Click **Generate new token**
3. Required permissions: **Actions** (read), **Contents** (read), **Metadata** (read)

### Configuration fields

| Field | Description | Example |
|-------|-------------|---------|
| URL | Repository path (owner/repo) | `github.com/acme-corp/backend-api/` |
| Token | Personal access token | `github_pat_11ABC123_placeholder_token_value` |
| Workflow File | CI workflow filename | `ci.yml` |
| Branch | Branch to track | `main` |
| Max Runs | Number of recent runs to fetch | `20` |

### JSON export example

```json
{
  "connectorType": "GITHUB",
  "name": "Backend API CI",
  "credentials": {
    "url": "github.com/acme-corp/backend-api/",
    "token": "github_pat_11ABC123_placeholder_token_value",
    "workflowFile": "ci.yml",
    "branch": "main",
    "maxRuns": 20
  },
  "fieldMapping": {},
  "syncSchedule": "0 0 * * *",
  "syncTimezone": "UTC"
}
```

## TestRail

### How to get an API key

1. Log into TestRail
2. Go to **My Settings → API Keys → Add Key**

### Configuration fields

| Field | Description | Example |
|-------|-------------|---------|
| URL | TestRail instance URL | `https://acme-corp.testrail.io/` |
| Username | TestRail login email | `qa-lead@acme-corp.com` |
| API Key | API key from step above | `aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0u` |
| Project ID | TestRail project ID | `1` |

### JSON export example

```json
{
  "connectorType": "TESTRAIL",
  "name": "My TestRail Project",
  "credentials": {
    "url": "https://acme-corp.testrail.io/",
    "username": "qa-lead@acme-corp.com",
    "apiKey": "aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0u",
    "projectId": "1"
  },
  "fieldMapping": {},
  "syncSchedule": "0 0 * * *",
  "syncTimezone": "UTC"
}
```

## Sync Schedule

The `syncSchedule` field uses standard cron format: `minute hour day-of-month month day-of-week`.

The default schedule is `0 0 * * *` (daily at midnight UTC).

| Schedule | Cron Expression | Description |
|----------|----------------|-------------|
| Daily at midnight | `0 0 * * *` | Default — runs once per day |
| Every 6 hours | `0 */6 * * *` | Runs at 00:00, 06:00, 12:00, 18:00 |
| Every hour | `0 * * * *` | Runs at the top of every hour |
| Weekdays at 8am | `0 8 * * 1-5` | Runs Mon-Fri at 08:00 UTC |

The `syncTimezone` field defaults to `"UTC"`. You can set it to any IANA timezone (e.g. `"America/New_York"`, `"Europe/Berlin"`).

## Verifying Connection

After configuring a connector, click **Test Connection** to verify credentials. The button sends a lightweight API call to the external tool and reports success or failure.

If the test fails, check:
- The URL is correct and accessible from your QOD instance
- The credentials (token/API key) are valid and not expired
- The user associated with the credentials has the required permissions

## Import / Export

Connector configs can be exported as JSON from **Settings → Export** and imported into another project. This is useful for:

- **Backup** — save your connector configs before making changes
- **Migrating configs between projects** — quickly replicate a setup in a new project
- **Sharing setup across team** — export and share the JSON file (remember to rotate tokens after sharing)

> **Security note**: Exported JSON contains credentials (API tokens, keys). Treat export files as sensitive and do not commit them to version control.
