/**
 * Format a duration in milliseconds to a human-readable string.
 * Examples: "250ms", "3.2s", "2m 15s", "1h 30m"
 */
export function formatDuration(ms: number | undefined): string {
  if (!ms) return '\u2014';
  if (ms < 1000) return `${ms}ms`;
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return `${min}m ${sec}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

/**
 * Format a date/time as a relative time string (e.g. "5m ago", "2h ago", "3d ago").
 */
export function formatRelativeTime(date: Date | string | undefined): string {
  if (!date) return 'never';
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
  return `${Math.floor(diffDay / 30)}mo ago`;
}
