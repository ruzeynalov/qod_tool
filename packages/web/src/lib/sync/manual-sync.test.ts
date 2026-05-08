import {
  getManualSyncAcceptedMessage,
  isManualSyncAccepted,
  isSyncRequestTimeoutError,
} from './manual-sync';

describe('manual sync helpers', () => {
  it('treats queued manual sync responses as accepted in-progress work', () => {
    expect(isManualSyncAccepted({
      success: true,
      status: 'queued',
      jobId: 'job-1',
    })).toBe(true);
    expect(getManualSyncAcceptedMessage({
      success: true,
      status: 'queued',
      jobId: 'job-1',
    })).toBe('Sync queued as job job-1. Connector status will update when it finishes.');
  });

  it('does not treat completed or failed responses as queued work', () => {
    expect(isManualSyncAccepted({ success: true, status: 'completed' })).toBe(false);
    expect(isManualSyncAccepted({ success: false, status: 'queued' })).toBe(false);
  });

  it('classifies gateway timeouts as status-check conditions, not sync failures', () => {
    expect(isSyncRequestTimeoutError(new Error('API error: 504'))).toBe(true);
    expect(isSyncRequestTimeoutError(new Error('upstream timed out'))).toBe(true);
    expect(isSyncRequestTimeoutError(new Error('API error: 403'))).toBe(false);
  });
});
