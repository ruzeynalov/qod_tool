'use client';

import { useState, useMemo, useCallback } from 'react';
import { Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { Sheet, DialogHeader, DialogTitle, DialogDescription, DialogBody } from '@/components/ui/dialog';
import { useMediaQuery } from '@/lib/utils/use-media-query';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useTestExecutionHistory } from '@/lib/api/hooks';
import type { TestExecutionEntry } from '@/lib/demo/demo-data-provider';
import { useChartColors } from '@/lib/hooks/use-chart-colors';
import { Badge } from '@/components/ui';
import { formatDuration } from '@/lib/utils/format';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TestHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  testCaseId: string | null;
  testTitle: string;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG = {
  PASSED: { label: 'Passed', variant: 'success' as const, numericValue: 3 },
  FLAKY: { label: 'Flaky', variant: 'warning' as const, numericValue: 2 },
  FAILED: { label: 'Failed', variant: 'error' as const, numericValue: 1 },
  SKIPPED: { label: 'Skipped', variant: 'neutral' as const, numericValue: 0 },
} as const;

function statusDotColor(status: TestExecutionEntry['status']): string {
  switch (status) {
    case 'PASSED':
      return '#22c55e';
    case 'FAILED':
      return '#ef4444';
    case 'FLAKY':
      return '#eab308';
    case 'SKIPPED':
      return '#94a3b8';
  }
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Custom chart tooltip
// ---------------------------------------------------------------------------

function ChartTooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { date: string; status: string; durationMs: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-xs shadow-lg">
      <p className="text-secondary">{data.date}</p>
      <p className="font-semibold text-primary">{data.status}</p>
      <p className="text-muted">{formatDuration(data.durationMs)}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom dot renderer for the AreaChart
// ---------------------------------------------------------------------------

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: { originalStatus: TestExecutionEntry['status'] };
}

function StatusDot({ cx, cy, payload }: DotProps) {
  if (cx == null || cy == null || !payload) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={statusDotColor(payload.originalStatus)}
      stroke="none"
    />
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TestHistoryDrawer({
  isOpen,
  onClose,
  projectId,
  testCaseId,
  testTitle,
}: TestHistoryDrawerProps) {
  const chartColors = useChartColors();
  const { data: history = [] } = useTestExecutionHistory(projectId, testCaseId);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  // On <md the drawer becomes a bottom sheet; on >=md it slides from the
  // right (its previous behaviour). The shared `Sheet` primitive owns
  // backdrop / focus trap / scroll lock / Esc — no hand-rolled keyboard
  // handling needed here.
  const isWide = useMediaQuery('(min-width: 768px)');

  // ── Chart data (chronological: oldest → newest for left-to-right) ───
  const chartData = useMemo(() => {
    return [...history].reverse().map((entry) => ({
      date: formatDate(entry.date),
      value: STATUS_CONFIG[entry.status].numericValue,
      status: STATUS_CONFIG[entry.status].label,
      originalStatus: entry.status,
      durationMs: entry.durationMs,
    }));
  }, [history]);

  // ── Stats ───────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (history.length === 0) {
      return { totalRuns: 0, passRate: 0, avgDuration: 0, failCount: 0 };
    }
    const totalRuns = history.length;
    const passedCount = history.filter((e) => e.status === 'PASSED').length;
    const failCount = history.filter((e) => e.status === 'FAILED').length;
    const avgDuration = Math.round(
      history.reduce((sum, e) => sum + e.durationMs, 0) / totalRuns,
    );
    const passRate = Math.round((passedCount / totalRuns) * 1000) / 10;

    return { totalRuns, passRate, avgDuration, failCount };
  }, [history]);

  // history is already newest-first from the API

  const toggleRow = useCallback((runId: string) => {
    setExpandedRow((prev) => (prev === runId ? null : runId));
  }, []);

  return (
    <Sheet
      open={isOpen}
      onClose={onClose}
      side={isWide ? 'right' : 'bottom'}
      className={isWide ? 'md:w-[28rem] md:max-w-[28rem] md:rounded-none md:border-l md:border-t-0' : ''}
    >
      <DialogHeader onClose={onClose}>
        <DialogTitle>Execution History</DialogTitle>
        <DialogDescription className="truncate">{testTitle}</DialogDescription>
      </DialogHeader>

      <DialogBody className="px-0 py-0">
          {history.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted">
              No execution history available.
            </div>
          ) : (
            <div className="space-y-5 p-5">
              {/* ── Mini trend chart ───────────────────────────────── */}
              <div>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                  Status Timeline
                </h3>
                <div className="h-[120px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={chartData}
                      margin={{ top: 8, right: 8, left: -24, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="statusFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={chartColors.grid} stopOpacity={0.4} />
                          <stop offset="95%" stopColor={chartColors.grid} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 9, fill: chartColors.axis }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        domain={[0, 3]}
                        ticks={[0, 1, 2, 3]}
                        tickFormatter={(v: number) => {
                          const labels: Record<number, string> = {
                            0: 'Skip',
                            1: 'Fail',
                            2: 'Flaky',
                            3: 'Pass',
                          };
                          return labels[v] ?? '';
                        }}
                        tick={{ fontSize: 9, fill: chartColors.axis }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <RechartsTooltip content={<ChartTooltipContent />} />
                      <ReferenceLine
                        y={3}
                        stroke={chartColors.grid}
                        strokeDasharray="3 3"
                      />
                      <Area
                        type="stepAfter"
                        dataKey="value"
                        stroke={chartColors.grid}
                        fill="url(#statusFill)"
                        strokeWidth={1}
                        dot={<StatusDot />}
                        activeDot={false}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ── Stats summary ──────────────────────────────────── */}
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-md border border-qod-border bg-qod-bg px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted">
                    Runs
                  </p>
                  <p className="mt-0.5 text-lg font-semibold text-primary">
                    {stats.totalRuns}
                  </p>
                </div>
                <div className="rounded-md border border-qod-border bg-qod-bg px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted">
                    Pass Rate
                  </p>
                  <p className="mt-0.5 text-lg font-semibold text-primary">
                    {stats.passRate}%
                  </p>
                </div>
                <div className="rounded-md border border-qod-border bg-qod-bg px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted">
                    Avg Duration
                  </p>
                  <p className="mt-0.5 text-lg font-semibold text-primary">
                    {formatDuration(stats.avgDuration)}
                  </p>
                </div>
                <div className="rounded-md border border-qod-border bg-qod-bg px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted">
                    Failures
                  </p>
                  <p className="mt-0.5 text-lg font-semibold text-primary">
                    {stats.failCount}
                  </p>
                </div>
              </div>

              {/* ── Execution history list ─────────────────────────── */}
              <div>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                  Execution Log
                </h3>
                <div className="space-y-1">
                  {history.map((entry) => {
                    const isExpanded = expandedRow === entry.runId;
                    const hasError = !!entry.errorMessage;

                    return (
                      <div
                        key={entry.runId}
                        className="rounded-md border border-qod-border bg-qod-bg"
                      >
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-qod-surface"
                          onClick={() => hasError && toggleRow(entry.runId)}
                          aria-expanded={isExpanded}
                        >
                          {/* Status badge */}
                          <Badge variant={STATUS_CONFIG[entry.status].variant}>
                            {STATUS_CONFIG[entry.status].label}
                          </Badge>

                          {/* Date & run name */}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs text-primary">
                              {entry.runName}
                            </p>
                            <p className="text-[10px] text-muted">
                              {formatDateTime(entry.date)}
                            </p>
                          </div>

                          {/* Duration */}
                          <div className="flex items-center gap-1 text-[10px] text-muted">
                            <Clock className="h-3 w-3" />
                            {formatDuration(entry.durationMs)}
                          </div>

                          {/* Branch */}
                          <span className="hidden rounded bg-qod-surface px-1.5 py-0.5 text-[10px] text-secondary sm:inline">
                            {entry.branch}
                          </span>

                          {/* Environment */}
                          <span className="hidden rounded bg-qod-surface px-1.5 py-0.5 text-[10px] text-secondary sm:inline">
                            {entry.environment}
                          </span>

                          {/* Expand indicator */}
                          {hasError && (
                            <span className="text-muted">
                              {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                            </span>
                          )}
                        </button>

                        {/* Expanded error message */}
                        {isExpanded && entry.errorMessage && (
                          <div className="border-t border-qod-border px-3 py-2">
                            <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-rag-red">
                              {entry.errorMessage}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
      </DialogBody>
    </Sheet>
  );
}
