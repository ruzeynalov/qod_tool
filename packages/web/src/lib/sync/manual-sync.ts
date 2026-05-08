export interface ManualSyncResponse {
  success: boolean;
  status?: 'queued' | 'running' | 'completed';
  jobId?: string;
  message?: string;
  error?: string;
  logs?: string[];
}

export function isManualSyncAccepted(result: ManualSyncResponse): boolean {
  return result.success && (result.status === 'queued' || result.status === 'running');
}

export function getManualSyncAcceptedMessage(result: ManualSyncResponse): string {
  if (result.message) return result.message;
  if (result.jobId) return `Sync queued as job ${result.jobId}. Connector status will update when it finishes.`;
  return 'Sync queued. Connector status will update when it finishes.';
}

export function isSyncRequestTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:\b504\b|timeout|timed out)/i.test(message);
}
