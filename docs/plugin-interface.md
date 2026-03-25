# Plugin Interface

New connectors implement `IQODConnector`:

```typescript
interface IQODConnector {
  name: string;
  type: 'tms' | 'issue_tracker' | 'ci' | 'scm';
  authenticate(config): Promise<AuthResult>;
  testConnection(config): Promise<AuthResult>;
  fetchTestCases?(config, since?): Promise<NormalizedTestCase[]>;
  fetchTestRuns?(config, since?): Promise<NormalizedTestRun[]>;
  fetchDefects?(config, since?): Promise<NormalizedDefect[]>;
  fetchStories?(config, since?): Promise<NormalizedStory[]>;
  fetchEpics?(config): Promise<NormalizedEpic[]>;
  fetchPipelineRuns?(config, since?): Promise<NormalizedPipelineRun[]>;
  onWebhookEvent?(payload, headers): Promise<void>;
}
```

Report upload connectors implement `IReportUploadConnector`:

```typescript
interface IReportUploadConnector {
  name: string;
  type: 'report_upload';
  parseReport(xmlContent: string): Promise<NormalizedTestRun>;
}
```
