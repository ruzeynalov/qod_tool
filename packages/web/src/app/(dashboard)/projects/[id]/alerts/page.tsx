'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, Plus, Pencil, Trash2, X, Check, BellOff, Bell, Search } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { useDemoMode } from '@/app/_providers/demo-mode-provider';
import { useAuth } from '@/app/_providers/auth-provider';
import {
  useAlertRules,
  useCreateAlertRule,
  useUpdateAlertRule,
  useDeleteAlertRule,
  useNotificationLog,
  useMarkNotificationRead,
  useMuteAlertFromNotification,
  useUnmuteAlertFromNotification,
  type Notification,
} from '@/lib/api/hooks';
import { METRICS, CONDITIONS, CHANNELS, type AlertRule } from '@/lib/demo/demo-alerts';

// ── Label maps ──────────────────────────────────────────────────────────

const METRIC_LABELS: Record<string, string> = {
  COVERAGE_PCT: 'Automation Coverage',
  PASS_RATE_7D: 'Pass Rate (7d)',
  PASS_RATE_30D: 'Pass Rate (30d)',
  FLAKY_RATE: 'Flaky Rate',
  MTTD_HOURS: 'MTTD (hours)',
  MTTR_HOURS: 'Mean Time to Resolve (days)',
  ESCAPE_RATE: 'Defect Escape Rate',
  EXEC_VELOCITY: 'Exec Velocity',
  REQ_COVERAGE: 'Req Coverage',
  READINESS_SCORE: 'Readiness Score',
  DEFECT_DENSITY: 'Defect Density',
};

const CONDITION_LABELS: Record<string, string> = {
  LESS_THAN: '< Less than',
  GREATER_THAN: '> Greater than',
  DELTA_PCT: '% Delta change',
};

const CHANNEL_LABELS: Record<string, string> = {
  SLACK: 'Slack (planned)',
  EMAIL: 'Email',
  IN_APP: 'In-App',
};

const HOURS_METRICS = new Set(['MTTR_HOURS']);

function toDisplayThreshold(metric: string, stored: number): number {
  return HOURS_METRICS.has(metric) ? stored / 24 : stored;
}

function toStorageThreshold(metric: string, display: number): number {
  return HOURS_METRICS.has(metric) ? display * 24 : display;
}

function thresholdLabel(metric: string): string {
  return HOURS_METRICS.has(metric) ? 'Threshold (days)' : 'Threshold';
}

// ── Shared input class ──────────────────────────────────────────────────

const inputClass =
  'w-full rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent';

const selectClass =
  'w-full rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent';

// ── Form state type ─────────────────────────────────────────────────────

interface RuleFormState {
  metric: string;
  condition: string;
  threshold: number;
  channel: string;
  webhookUrl: string;
  enabled: boolean;
}

const DEFAULT_FORM: RuleFormState = {
  metric: METRICS[0],
  condition: CONDITIONS[0],
  threshold: 80,
  channel: 'IN_APP',
  webhookUrl: '',
  enabled: true,
};

// ── Main page component ─────────────────────────────────────────────────

export default function AlertRulesPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? '';
  const { demoMode } = useDemoMode();
  const { isAdmin } = useAuth();

  const { data: rules, isLoading, error } = useAlertRules(projectId);
  const createRule = useCreateAlertRule(projectId);
  const updateRule = useUpdateAlertRule(projectId);
  const deleteRule = useDeleteAlertRule(projectId);

  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [form, setForm] = useState<RuleFormState>(DEFAULT_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState<AlertRule | null>(null);
  const [demoToast, setDemoToast] = useState(false);

  // ── Helpers ─────────────────────────────────────────────────────────

  function showDemoWarning() {
    setDemoToast(true);
    setTimeout(() => setDemoToast(false), 2500);
  }

  function openCreate() {
    if (demoMode) {
      showDemoWarning();
      return;
    }
    setEditingRule(null);
    setForm(DEFAULT_FORM);
    setShowModal(true);
  }

  function openEdit(rule: AlertRule) {
    if (demoMode) {
      showDemoWarning();
      return;
    }
    setEditingRule(rule);
    setForm({
      metric: rule.metric,
      condition: rule.condition,
      threshold: toDisplayThreshold(rule.metric, rule.threshold),
      channel: rule.channel,
      webhookUrl: rule.channelConfig?.webhookUrl ?? '',
      enabled: rule.enabled,
    });
    setShowModal(true);
  }

  function openDelete(rule: AlertRule) {
    if (demoMode) {
      showDemoWarning();
      return;
    }
    setDeleteConfirm(rule);
  }

  async function handleToggleEnabled(rule: AlertRule) {
    if (demoMode) {
      showDemoWarning();
      return;
    }
    await updateRule.mutateAsync({ id: rule.id, enabled: !rule.enabled });
  }

  async function handleSubmit() {
    const channelConfig: Record<string, any> =
      form.channel === 'SLACK' && form.webhookUrl
        ? { webhookUrl: form.webhookUrl }
        : {};

    const storedThreshold = toStorageThreshold(form.metric, form.threshold);

    if (editingRule) {
      await updateRule.mutateAsync({
        id: editingRule.id,
        metric: form.metric,
        condition: form.condition,
        threshold: storedThreshold,
        channel: form.channel,
        channelConfig,
        enabled: form.enabled,
      });
    } else {
      await createRule.mutateAsync({
        metric: form.metric,
        condition: form.condition,
        threshold: storedThreshold,
        channel: form.channel,
        channelConfig,
      });
    }
    setShowModal(false);
  }

  async function handleDelete() {
    if (!deleteConfirm) return;
    await deleteRule.mutateAsync(deleteConfirm.id);
    setDeleteConfirm(null);
  }

  // ── Loading / error states ──────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-qod-accent" />
        <span className="ml-3 text-sm text-secondary">Loading alert rules...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-80 items-center justify-center">
        <span className="text-sm text-secondary">Failed to load alert rules. Please try again.</span>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Demo toast */}
      {demoToast && (
        <div className="fixed right-4 top-4 z-[60] rounded-lg border border-rag-amber/30 bg-rag-amber/15 px-4 py-3 text-sm font-medium text-rag-amber shadow-lg">
          Mutations are disabled in demo mode
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-primary">Alert Rules</h1>
          <p className="mt-0.5 text-xs text-muted">
            Configure threshold-based alerts for quality metrics.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Create Rule
          </Button>
        )}
      </div>

      {/* Mobile cards (parallel to the table) */}
      <ul className="md:hidden divide-y divide-qod-border/60 rounded-lg border border-qod-border bg-qod-surface" role="list">
        {(!rules || rules.length === 0) ? (
          <li className="px-4 py-12 text-center text-sm text-muted">
            No alert rules configured yet. Tap &quot;Create Rule&quot; to add one.
          </li>
        ) : (
          rules.map((rule) => (
            <li key={rule.id} className="px-4 py-3">
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1 text-sm font-medium text-primary">
                  {METRIC_LABELS[rule.metric] ?? rule.metric}
                </span>
                <button
                  type="button"
                  onClick={() => handleToggleEnabled(rule)}
                  disabled={!isAdmin}
                  className={cn(
                    'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-qod-accent/50',
                    rule.enabled ? 'bg-qod-accent' : 'bg-qod-border',
                    isAdmin ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
                  )}
                  role="switch"
                  aria-checked={rule.enabled}
                  aria-label="Toggle rule"
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                      rule.enabled ? 'translate-x-4' : 'translate-x-0',
                    )}
                  />
                </button>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                <span>{CONDITION_LABELS[rule.condition] ?? rule.condition} {toDisplayThreshold(rule.metric, rule.threshold)}{HOURS_METRICS.has(rule.metric) ? 'd' : ''}</span>
                <span>{CHANNEL_LABELS[rule.channel] ?? rule.channel}</span>
                {rule.lastTriggered && (
                  <span>
                    last{' '}
                    {new Date(rule.lastTriggered).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                )}
              </div>
              {isAdmin && (
                <div className="mt-2 flex items-center justify-end gap-1">
                  <button
                    type="button"
                    aria-label="Edit rule"
                    onClick={() => openEdit(rule)}
                    className="flex h-11 w-11 items-center justify-center rounded text-secondary hover:bg-qod-bg hover:text-primary"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete rule"
                    onClick={() => openDelete(rule)}
                    className="flex h-11 w-11 items-center justify-center rounded text-secondary hover:bg-rag-red/10 hover:text-rag-red"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </li>
          ))
        )}
      </ul>

      {/* Table */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-qod-border bg-qod-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-qod-border text-left">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Metric</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Condition</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Threshold</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Channel</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Enabled</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Last Triggered</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(!rules || rules.length === 0) ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted">
                  No alert rules configured yet. Click &quot;Create Rule&quot; to add one.
                </td>
              </tr>
            ) : (
              rules.map((rule) => (
                <tr key={rule.id} className="border-b border-qod-border last:border-b-0 hover:bg-qod-bg/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-primary">
                    {METRIC_LABELS[rule.metric] ?? rule.metric}
                  </td>
                  <td className="px-4 py-3 text-secondary">
                    {CONDITION_LABELS[rule.condition] ?? rule.condition}
                  </td>
                  <td className="px-4 py-3 text-secondary">
                    {toDisplayThreshold(rule.metric, rule.threshold)}
                    {HOURS_METRICS.has(rule.metric) ? 'd' : ''}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-qod-bg px-2.5 py-0.5 text-xs font-medium text-secondary">
                      {CHANNEL_LABELS[rule.channel] ?? rule.channel}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleToggleEnabled(rule)}
                      disabled={!isAdmin}
                      className={cn(
                        'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-qod-accent/50 focus:ring-offset-2 focus:ring-offset-qod-surface',
                        rule.enabled ? 'bg-qod-accent' : 'bg-qod-border',
                        isAdmin ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
                      )}
                      role="switch"
                      aria-checked={rule.enabled}
                      title={isAdmin ? undefined : 'Only admins can change rules'}
                    >
                      <span
                        className={cn(
                          'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                          rule.enabled ? 'translate-x-4' : 'translate-x-0'
                        )}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-secondary">
                    {rule.lastTriggered
                      ? new Date(rule.lastTriggered).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(rule)}
                          className="rounded p-1.5 text-secondary hover:bg-qod-bg hover:text-primary transition-colors"
                          title="Edit rule"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openDelete(rule)}
                          className="rounded p-1.5 text-secondary hover:bg-rag-red/10 hover:text-rag-red transition-colors"
                          title="Delete rule"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted">Read-only</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Alert Log */}
      <AlertLogSection projectId={projectId} />

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-lg border border-qod-border bg-qod-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-qod-border px-4 py-3">
              <h3 className="text-sm font-semibold text-primary">
                {editingRule ? 'Edit Alert Rule' : 'Create Alert Rule'}
              </h3>
              <button onClick={() => setShowModal(false)} className="rounded p-1 text-muted hover:text-primary hover:bg-qod-bg">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form */}
            <div className="px-4 py-4 space-y-4">
              {/* Metric */}
              <div>
                <label className="block text-xs font-medium text-secondary mb-1.5">Metric</label>
                <select
                  value={form.metric}
                  onChange={(e) => setForm({ ...form, metric: e.target.value })}
                  className={selectClass}
                >
                  {METRICS.map((m) => (
                    <option key={m} value={m}>
                      {METRIC_LABELS[m] ?? m}
                    </option>
                  ))}
                </select>
              </div>

              {/* Condition */}
              <div>
                <label className="block text-xs font-medium text-secondary mb-1.5">Condition</label>
                <select
                  value={form.condition}
                  onChange={(e) => setForm({ ...form, condition: e.target.value })}
                  className={selectClass}
                >
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {CONDITION_LABELS[c] ?? c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Threshold */}
              <div>
                <label className="block text-xs font-medium text-secondary mb-1.5">{thresholdLabel(form.metric)}</label>
                <input
                  type="number"
                  value={form.threshold}
                  onChange={(e) => setForm({ ...form, threshold: parseFloat(e.target.value) || 0 })}
                  className={inputClass}
                  placeholder="e.g. 80"
                />
              </div>

              {/* Channel */}
              <div>
                <label className="block text-xs font-medium text-secondary mb-1.5">Channel</label>
                <select
                  value={form.channel}
                  onChange={(e) => setForm({ ...form, channel: e.target.value })}
                  className={selectClass}
                >
                  {CHANNELS.map((ch) => (
                    <option key={ch} value={ch}>
                      {CHANNEL_LABELS[ch] ?? ch}
                    </option>
                  ))}
                </select>
              </div>

              {/* Webhook URL (Slack only) */}
              {form.channel === 'SLACK' && (
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1.5">Slack Webhook URL</label>
                  <input
                    type="url"
                    value={form.webhookUrl}
                    onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })}
                    className={inputClass}
                    placeholder="https://hooks.slack.com/services/..."
                  />
                </div>
              )}

              {/* Enabled (edit mode only) */}
              {editingRule && (
                <div className="flex items-center gap-3">
                  <label className="text-xs font-medium text-secondary">Enabled</label>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, enabled: !form.enabled })}
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-qod-accent/50',
                      form.enabled ? 'bg-qod-accent' : 'bg-qod-border'
                    )}
                    role="switch"
                    aria-checked={form.enabled}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                        form.enabled ? 'translate-x-4' : 'translate-x-0'
                      )}
                    />
                  </button>
                </div>
              )}

              {/* Error display */}
              {(createRule.isError || updateRule.isError) && (
                <p className="text-xs text-rag-red">
                  {((createRule.error || updateRule.error) as Error)?.message || 'An error occurred.'}
                </p>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={createRule.isPending || updateRule.isPending}
                >
                  {(createRule.isPending || updateRule.isPending)
                    ? 'Saving...'
                    : editingRule
                      ? 'Update Rule'
                      : 'Create Rule'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-lg border border-qod-border bg-qod-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-primary">Delete Alert Rule</h3>
            <p className="mt-2 text-sm text-secondary">
              Are you sure you want to delete the alert rule for{' '}
              <span className="font-medium text-primary">
                {METRIC_LABELS[deleteConfirm.metric] ?? deleteConfirm.metric}
              </span>
              ? This action cannot be undone.
            </p>
            {deleteRule.isError && (
              <p className="mt-2 text-xs text-rag-red">
                {(deleteRule.error as Error)?.message || 'Failed to delete.'}
              </p>
            )}
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleDelete}
                disabled={deleteRule.isPending}
              >
                {deleteRule.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Alert Log (read-only stream of past notifications for this project) ─

function ruleDetails(rule: Notification['alertRule']): string {
  if (!rule) return '';
  const metric = METRIC_LABELS[rule.metric] ?? rule.metric;
  const cond = CONDITION_LABELS[rule.condition] ?? rule.condition;
  return `${metric} ${cond} ${toDisplayThreshold(rule.metric, rule.threshold)}${HOURS_METRICS.has(rule.metric) ? 'd' : ''}`;
}

function AlertLogSection({ projectId }: { projectId: string }) {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const pageSize = 10;

  // Map the search term to any metric enum values whose human label matches,
  // so the backend also returns notifications whose rule is of that metric
  // (e.g. typing "Def" matches "Defect Escape Rate" + "Defect Density").
  const matchingMetrics = search
    ? Object.entries(METRIC_LABELS)
        .filter(([, label]) => label.toLowerCase().includes(search.toLowerCase()))
        .map(([value]) => value)
    : [];

  const { data, isLoading } = useNotificationLog({
    page,
    pageSize,
    search,
    projectId,
    metrics: matchingMetrics,
  });
  const markRead = useMarkNotificationRead();
  const mute = useMuteAlertFromNotification();
  const unmute = useUnmuteAlertFromNotification();

  // Debounced auto-search: 300ms after the user stops typing, apply the
  // filter if there are >2 characters, or clear it if the input is empty.
  useEffect(() => {
    const trimmed = searchInput.trim();
    const timer = setTimeout(() => {
      if (trimmed.length === 0) {
        if (search !== '') {
          setPage(1);
          setSearch('');
        }
      } else if (trimmed.length > 2 && trimmed !== search) {
        setPage(1);
        setSearch(trimmed);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, search]);

  // Read hash on mount + whenever it changes (supports same-project bell clicks).
  useEffect(() => {
    function readHash() {
      const hash = typeof window !== 'undefined' ? window.location.hash : '';
      const match = hash.match(/^#alert-log-([0-9a-f-]+)$/i);
      if (match) setHighlightId(match[1]);
    }
    readHash();
    window.addEventListener('hashchange', readHash);
    return () => window.removeEventListener('hashchange', readHash);
  }, []);

  // Scroll the highlighted row into view once it's rendered, then clear
  // the highlight after a few seconds.
  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`alert-log-${highlightId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const timer = setTimeout(() => setHighlightId(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [highlightId, data]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-primary">Alert Log</h2>
          <p className="mt-0.5 text-xs text-muted">
            Past alert notifications for this project.
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search alert text (3+ chars)..."
            className={cn(inputClass, 'w-64 pl-8')}
          />
        </div>
      </div>

      {/* Mobile cards (parallel to the table) */}
      <ul className="md:hidden divide-y divide-qod-border/60 rounded-lg border border-qod-border bg-qod-surface" role="list">
        {isLoading ? (
          <li className="px-4 py-10 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-qod-accent" />
          </li>
        ) : items.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-muted">
            {search ? 'No alerts match your search.' : 'No alerts logged yet.'}
          </li>
        ) : (
          items.map((n) => (
            <li
              key={n.id}
              id={`alert-log-mobile-${n.id}`}
              className={cn(
                'px-4 py-3',
                !n.read && 'bg-qod-accent/5',
                highlightId === n.id && 'ring-2 ring-qod-accent ring-inset bg-qod-accent/10',
              )}
            >
              <div className="flex items-start gap-2">
                {!n.read && (
                  <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-qod-accent" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-primary">{n.title}</div>
                  <p className="mt-0.5 text-xs text-muted line-clamp-2">{n.body}</p>
                </div>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                <span>
                  {new Date(n.createdAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {n.alertRule && <span>{ruleDetails(n.alertRule)}</span>}
                {n.muted && <span>muted</span>}
                {n.alertRule && !n.alertRule.enabled && <span>disabled</span>}
              </div>
              <div className="mt-2 flex items-center justify-end gap-1">
                <button
                  type="button"
                  aria-label={n.read ? 'Already read' : 'Mark as read'}
                  onClick={() => !n.read && markRead.mutate(n.id)}
                  disabled={n.read || markRead.isPending}
                  className="flex h-11 w-11 items-center justify-center rounded text-secondary hover:bg-qod-bg hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Check className="h-4 w-4" />
                </button>
                {n.muted ? (
                  <button
                    type="button"
                    aria-label="Unmute (restore to bell)"
                    onClick={() => unmute.mutate(n.id)}
                    disabled={unmute.isPending}
                    className="flex h-11 w-11 items-center justify-center rounded text-qod-accent hover:bg-qod-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Bell className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label="Mute (hide from bell, keep in log)"
                    onClick={() => mute.mutate(n.id)}
                    disabled={mute.isPending}
                    className="flex h-11 w-11 items-center justify-center rounded text-secondary hover:bg-rag-amber/10 hover:text-rag-amber disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <BellOff className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))
        )}
      </ul>

      <div className="hidden md:block overflow-x-auto rounded-lg border border-qod-border bg-qod-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-qod-border text-left">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Time</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Alert</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Rule</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Read</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-qod-accent" />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
                  {search ? 'No alerts match your search.' : 'No alerts logged yet.'}
                </td>
              </tr>
            ) : (
              items.map((n) => (
                <tr
                  key={n.id}
                  id={`alert-log-${n.id}`}
                  className={cn(
                    'border-b border-qod-border last:border-b-0 hover:bg-qod-bg/50 transition-colors',
                    !n.read && 'bg-qod-accent/5',
                    highlightId === n.id && 'ring-2 ring-qod-accent ring-inset bg-qod-accent/10',
                  )}
                >
                  <td className="px-4 py-3 text-secondary whitespace-nowrap">
                    {new Date(n.createdAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-primary">{n.title}</div>
                    <div className="mt-0.5 text-xs text-muted line-clamp-2">{n.body}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-secondary">
                    {n.alertRule ? (
                      <div className="flex items-center gap-1.5">
                        <span>{ruleDetails(n.alertRule)}</span>
                        {n.muted && (
                          <span className="inline-flex items-center rounded-full bg-qod-bg px-1.5 py-0.5 text-[10px] font-medium text-muted">
                            muted
                          </span>
                        )}
                        {!n.alertRule.enabled && (
                          <span className="inline-flex items-center rounded-full bg-qod-bg px-1.5 py-0.5 text-[10px] font-medium text-muted">
                            disabled
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {n.read ? (
                      <span className="text-xs text-muted">Read</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-qod-accent">
                        <span className="h-1.5 w-1.5 rounded-full bg-qod-accent" />
                        Unread
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => !n.read && markRead.mutate(n.id)}
                        disabled={n.read || markRead.isPending}
                        className="rounded p-1.5 text-secondary hover:bg-qod-bg hover:text-primary transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                        title={n.read ? 'Already read' : 'Mark as read'}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      {n.muted ? (
                        <button
                          type="button"
                          onClick={() => unmute.mutate(n.id)}
                          disabled={unmute.isPending}
                          className="rounded p-1.5 text-qod-accent hover:bg-qod-accent/10 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                          title="Unmute (restore to bell)"
                        >
                          <Bell className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => mute.mutate(n.id)}
                          disabled={mute.isPending}
                          className="rounded p-1.5 text-secondary hover:bg-rag-amber/10 hover:text-rag-amber transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                          title="Mute (hide from bell, keep in log)"
                        >
                          <BellOff className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Previous
            </Button>
            <span>
              Page {page} / {totalPages}
            </span>
            <Button
              variant="ghost"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
