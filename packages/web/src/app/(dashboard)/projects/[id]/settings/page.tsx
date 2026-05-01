'use client';

import { useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Plug2,
  SlidersHorizontal,
  Settings2,
  Github,
  TestTube2,
  FileCode2,
  Plus,
  Pencil,
  Trash2,
  Pause,
  Play,
  AlertTriangle,
  Save,
  Info,
  X,
  RefreshCw,
  BookOpen,
  Download,
  Upload,
  ScrollText,
  Calculator,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatRelativeTime } from '@/lib/utils/format';
import { Tabs, type Tab } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { useProject } from '@/lib/api/hooks';
import { apiClient } from '@/lib/api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDemoMode } from '@/app/_providers/demo-mode-provider';
import { useAuth } from '@/app/_providers/auth-provider';
import { KPIFormulaConfigurator } from './_components/kpi-formula-configurator';

// ─── Tab definitions ───────────────────────────────────────────────────

const settingsTabs: Tab[] = [
  { id: 'connectors', label: 'Connectors', icon: <Plug2 className="h-3.5 w-3.5" /> },
  { id: 'kpi-thresholds', label: 'KPI Thresholds', icon: <SlidersHorizontal className="h-3.5 w-3.5" /> },
  { id: 'kpi-formulas', label: 'KPI Formulas', icon: <Calculator className="h-3.5 w-3.5" /> },
  { id: 'general', label: 'General', icon: <Settings2 className="h-3.5 w-3.5" /> },
];

// ─── Static demo connectors ───────────────────────────────────────────

interface Connector {
  id: string;
  type: 'github' | 'testrail' | 'jira' | 'jira_stories' | 'junit_xml' | 'testng_xml';
  name: string;
  status: 'active' | 'paused' | 'error';
  lastSyncAt: string | null;
  syncSchedule: string;
  syncTimezone: string;
}

const CONNECTOR_TYPE_OPTIONS = [
  { value: 'github', label: 'GitHub' },
  { value: 'testrail', label: 'TestRail' },
  { value: 'jira', label: 'Jira Defects' },
  { value: 'jira_stories', label: 'Jira Stories' },
  { value: 'junit_xml', label: 'JUnit XML' },
  { value: 'testng_xml', label: 'TestNG XML' },
];

const SCHEDULE_PRESETS = [
  { value: '*/15 * * * *', label: 'Every 15 minutes' },
  { value: '0 * * * *', label: 'Hourly' },
  { value: '0 0 * * *', label: 'Daily (midnight)' },
  { value: '0 */6 * * *', label: 'Every 6 hours' },
];

const TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern Time (US)' },
  { value: 'America/Chicago', label: 'Central Time (US)' },
  { value: 'America/Denver', label: 'Mountain Time (US)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
  { value: 'Europe/Moscow', label: 'Moscow (MSK)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Asia/Shanghai', label: 'China (CST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
  { value: 'Pacific/Auckland', label: 'Auckland (NZST/NZDT)' },
];

function getLocalTimezone(): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return TIMEZONE_OPTIONS.some((o) => o.value === tz) ? tz : 'UTC';
}

const CONNECTOR_ICONS: Record<Connector['type'], React.ElementType> = {
  github: Github,
  testrail: TestTube2,
  jira: AlertTriangle,
  jira_stories: BookOpen,
  junit_xml: FileCode2,
  testng_xml: FileCode2,
};

const CONNECTOR_TYPE_LABELS: Record<Connector['type'], string> = {
  github: 'GitHub',
  testrail: 'TestRail',
  jira: 'Jira Defects',
  jira_stories: 'Jira Stories',
  junit_xml: 'JUnit XML',
  testng_xml: 'TestNG XML',
};

// ─── KPI metric definitions ──────────────────────────────────────────

interface KPIThreshold {
  metric: string;
  label: string;
  unit: string;
  lowerIsBetter: boolean;
  currentValue: number;
  target: number;
  greenThreshold: number;
  amberThreshold: number;
}

const DEFAULT_KPI_THRESHOLDS: KPIThreshold[] = [
  { metric: 'COVERAGE_PCT', label: 'Test Coverage', unit: '%', lowerIsBetter: false, currentValue: 76.4, target: 80, greenThreshold: 80, amberThreshold: 60 },
  { metric: 'PASS_RATE_7D', label: 'Pass Rate (7d)', unit: '%', lowerIsBetter: false, currentValue: 89.2, target: 90, greenThreshold: 90, amberThreshold: 75 },
  { metric: 'PASS_RATE_30D', label: 'Pass Rate (30d)', unit: '%', lowerIsBetter: false, currentValue: 87.5, target: 90, greenThreshold: 90, amberThreshold: 75 },
  { metric: 'FLAKY_RATE', label: 'Flaky Rate', unit: '%', lowerIsBetter: true, currentValue: 4.2, target: 5, greenThreshold: 5, amberThreshold: 10 },
  { metric: 'MTTD_HOURS', label: 'Mean Time to Detect', unit: 'hrs', lowerIsBetter: true, currentValue: 3.1, target: 2, greenThreshold: 2, amberThreshold: 6 },
  { metric: 'MTTR_HOURS', label: 'Mean Time to Resolve', unit: 'hrs', lowerIsBetter: true, currentValue: 28.4, target: 24, greenThreshold: 24, amberThreshold: 48 },
  { metric: 'ESCAPE_RATE', label: 'Escape Rate', unit: '%', lowerIsBetter: true, currentValue: 8.3, target: 10, greenThreshold: 10, amberThreshold: 20 },
  { metric: 'EXEC_VELOCITY', label: 'Execution Velocity', unit: 'tests/day', lowerIsBetter: false, currentValue: 85, target: 100, greenThreshold: 100, amberThreshold: 60 },
  { metric: 'REQ_COVERAGE', label: 'Requirements Coverage', unit: '%', lowerIsBetter: false, currentValue: 68.5, target: 75, greenThreshold: 75, amberThreshold: 50 },
  { metric: 'READINESS_SCORE', label: 'Release Readiness', unit: '%', lowerIsBetter: false, currentValue: 72.0, target: 80, greenThreshold: 80, amberThreshold: 60 },
];

// ─── Helpers ─────────────────────────────────────────────────────────

function computeRAG(
  value: number,
  greenThreshold: number,
  amberThreshold: number,
  lowerIsBetter: boolean,
): 'GREEN' | 'AMBER' | 'RED' {
  if (lowerIsBetter) {
    if (value <= greenThreshold) return 'GREEN';
    if (value <= amberThreshold) return 'AMBER';
    return 'RED';
  }
  if (value >= greenThreshold) return 'GREEN';
  if (value >= amberThreshold) return 'AMBER';
  return 'RED';
}

function ragToBadgeVariant(rag: 'GREEN' | 'AMBER' | 'RED') {
  if (rag === 'GREEN') return 'success' as const;
  if (rag === 'AMBER') return 'warning' as const;
  return 'error' as const;
}


// ─── Connectors Tab ──────────────────────────────────────────────────

function ConnectorsTab({ projectId, readOnly = false }: { projectId: string; readOnly?: boolean }) {
  const queryClient = useQueryClient();
  const { data: rawConnectors = [] } = useQuery<any[]>({
    queryKey: ['connectors', projectId],
    queryFn: async () => {
      try {
        return await apiClient<any[]>(`/api/v1/projects/${projectId}/connectors`);
      } catch {
        return [];
      }
    },
    staleTime: 10_000,
  });
  const connectors: Connector[] = rawConnectors
    .map((c) => ({
      id: c.id,
      type: c.connectorType.toLowerCase() as Connector['type'],
      name: c.name,
      status: (c.status ?? 'active').toLowerCase() as Connector['status'],
      lastSyncAt: c.lastSyncAt ?? null,
      syncSchedule: c.syncSchedule ?? '0 * * * *',
      syncTimezone: c.syncTimezone ?? 'UTC',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [newConnector, setNewConnector] = useState({
    type: '',
    name: '',
    schedule: '0 * * * *',
    timezone: getLocalTimezone(),
    // Credential fields
    url: '',
    token: '',
    username: '',
    apiKey: '',
    filePath: '',
    projectId: '',
    projectKey: '',
    workflowFile: '',
    branch: '',
    maxRuns: '',
    escapedLabel: '',
    issueType: '',
    storyIssueType: '',
    epicIssueType: '',
    storyPointsField: '',
    artifactPattern: '',
    // Field mappings
    fieldMappings: [{ key: '', value: '' }],
  });

  const addFieldMapping = () => {
    setNewConnector((prev) => ({
      ...prev,
      fieldMappings: [...prev.fieldMappings, { key: '', value: '' }],
    }));
  };

  const removeFieldMapping = (index: number) => {
    setNewConnector((prev) => ({
      ...prev,
      fieldMappings: prev.fieldMappings.filter((_, i) => i !== index),
    }));
  };

  const updateFieldMapping = (index: number, field: 'key' | 'value', val: string) => {
    setNewConnector((prev) => ({
      ...prev,
      fieldMappings: prev.fieldMappings.map((m, i) => (i === index ? { ...m, [field]: val } : m)),
    }));
  };

  const startEditing = async (connectorId: string) => {
    try {
      // Fetch the individual connector to get decrypted credentials
      const raw = await apiClient<any>(`/api/v1/projects/${projectId}/connectors/${connectorId}`);
      if (!raw) return;
      const creds = (raw.credentials ?? {}) as Record<string, string>;
      const fm = (raw.fieldMapping ?? {}) as Record<string, string>;
      const mappings = Object.entries(fm).map(([key, value]) => ({ key, value }));
      setNewConnector({
        type: raw.connectorType.toLowerCase(),
        name: raw.name,
        schedule: raw.syncSchedule ?? '0 * * * *',
        timezone: raw.syncTimezone ?? 'UTC',
        url: creds.url ?? '',
        token: creds.token ?? '',
        username: creds.username ?? '',
        apiKey: creds.apiKey ?? '',
        filePath: creds.filePath ?? '',
        projectId: creds.projectId ?? '',
        projectKey: creds.projectKey ?? '',
        workflowFile: creds.workflowFile ?? '',
        branch: creds.branch ?? '',
        maxRuns: creds.maxRuns ? String(creds.maxRuns) : '',
        escapedLabel: creds.escapedLabel ?? '',
        issueType: creds.issueType ?? '',
        storyIssueType: creds.storyIssueType ?? '',
        epicIssueType: creds.epicIssueType ?? '',
        storyPointsField: creds.storyPointsField ?? '',
        artifactPattern: creds.artifactPattern ?? '',
        fieldMappings: mappings.length > 0 ? mappings : [{ key: '', value: '' }],
      });
      setEditingId(connectorId);
      setShowAddForm(true);
    } catch (err) {
      console.error('Failed to load connector for editing:', err);
    }
  };

  const handleDelete = async (connectorId: string) => {
    try {
      await apiClient(`/api/v1/projects/${projectId}/connectors/${connectorId}`, { method: 'DELETE' });
      await queryClient.invalidateQueries({ queryKey: ['connectors', projectId] });
    } catch (err) {
      console.error('Failed to delete connector:', err);
    }
  };

  const handleTogglePause = async (connector: Connector) => {
    const newStatus = connector.status === 'paused' ? 'ACTIVE' : 'PAUSED';
    try {
      await apiClient(`/api/v1/projects/${projectId}/connectors/${connector.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      await queryClient.invalidateQueries({ queryKey: ['connectors', projectId] });
    } catch (err) {
      console.error('Failed to toggle connector status:', err);
    }
  };

  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [syncMessages, setSyncMessages] = useState<Map<string, { type: 'info' | 'success' | 'error'; text: string }>>(new Map());
  const [syncLogs, setSyncLogs] = useState<Map<string, string[]>>(new Map());
  const [logModalId, setLogModalId] = useState<string | null>(null);

  const updateSyncMsg = useCallback((id: string, type: 'info' | 'success' | 'error', text: string) => {
    setSyncMessages((prev) => new Map(prev).set(id, { type, text }));
  }, []);

  const handleSync = async (connectorId: string) => {
    setSyncingIds((prev) => new Set(prev).add(connectorId));
    updateSyncMsg(connectorId, 'info', 'Sync started — fetching data from external source…');
    setSyncLogs((prev) => new Map(prev).set(connectorId, ['Sync started…']));
    try {
      const result = await apiClient<{ success: boolean; error?: string; logs?: string[] }>(
        `/api/v1/projects/${projectId}/connectors/${connectorId}/sync`,
        { method: 'POST', body: '{}' },
      );
      if (result.logs) {
        setSyncLogs((prev) => new Map(prev).set(connectorId, result.logs!));
      }
      if (!result.success) {
        updateSyncMsg(connectorId, 'error', `Sync failed: ${result.error || 'Unknown error'}`);
      } else {
        updateSyncMsg(connectorId, 'success', 'Sync completed successfully.');
      }
      await queryClient.invalidateQueries({ queryKey: ['connectors', projectId] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      updateSyncMsg(connectorId, 'error', `Sync failed: ${msg}`);
      setSyncLogs((prev) => new Map(prev).set(connectorId, [...(prev.get(connectorId) ?? []), `Error: ${msg}`]));
    } finally {
      setSyncingIds((prev) => { const next = new Set(prev); next.delete(connectorId); return next; });
      // Auto-dismiss success after 8s
      setTimeout(() => {
        setSyncMessages((prev) => {
          const current = prev.get(connectorId);
          if (current && current.type !== 'error') {
            const next = new Map(prev);
            next.delete(connectorId);
            return next;
          }
          return prev;
        });
      }, 8000);
    }
  };

  const resetForm = () => {
    setShowAddForm(false);
    setEditingId(null);
    setNewConnector({
      type: '', name: '', schedule: '0 * * * *', timezone: getLocalTimezone(),
      url: '', token: '', username: '', apiKey: '', filePath: '', projectId: '', projectKey: '', workflowFile: '', branch: '', maxRuns: '', escapedLabel: '',
      issueType: '', storyIssueType: '', epicIssueType: '', storyPointsField: '', artifactPattern: '',
      fieldMappings: [{ key: '', value: '' }],
    });
  };

  // ─── Export / Import ─────────────────────────────────────────────
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleExport = async () => {
    try {
      const exportData = await apiClient<any[]>(`/api/v1/projects/${projectId}/connectors/export`);
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qod-connectors-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMessage(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error('Expected a JSON array of connectors');
      let created = 0;
      let skipped = 0;
      for (const item of data) {
        if (!item.connectorType || !item.name) { skipped++; continue; }
        const exists = rawConnectors.some(
          (c) => c.connectorType === item.connectorType && c.name === item.name,
        );
        if (exists) { skipped++; continue; }
        await apiClient(`/api/v1/projects/${projectId}/connectors`, {
          method: 'POST',
          body: JSON.stringify({
            connectorType: item.connectorType,
            name: item.name,
            credentials: typeof item.credentials === 'string' ? JSON.parse(item.credentials) : (item.credentials ?? {}),
            fieldMapping: item.fieldMapping ?? {},
            syncSchedule: item.syncSchedule ?? '0 * * * *',
            syncTimezone: item.syncTimezone ?? 'UTC',
          }),
        });
        created++;
      }
      await queryClient.invalidateQueries({ queryKey: ['connectors', projectId] });
      setImportMessage({
        type: 'success',
        text: `Imported ${created} connector${created !== 1 ? 's' : ''}${skipped > 0 ? `, ${skipped} skipped (duplicate or invalid)` : ''}.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setImportMessage({ type: 'error', text: `Import failed: ${msg}` });
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
      setTimeout(() => setImportMessage(null), 6000);
    }
  };

  const renderCredentialFields = () => {
    switch (newConnector.type) {
      case 'github':
        return (
          <>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">Repository URL</label>
              <input
                type="text"
                placeholder="https://github.com/org/repo"
                value={newConnector.url}
                onChange={(e) => setNewConnector((prev) => ({ ...prev, url: e.target.value }))}
                className="w-full rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">Personal Access Token</label>
              <input
                type="password"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                value={newConnector.token}
                onChange={(e) => setNewConnector((prev) => ({ ...prev, token: e.target.value }))}
                className="w-full rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">Workflow File (optional)</label>
              <input
                type="text"
                placeholder="e.g. build-e2e-tests.yml"
                value={newConnector.workflowFile}
                onChange={(e) => setNewConnector((prev) => ({ ...prev, workflowFile: e.target.value }))}
                className="w-full rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent"
              />
              <p className="mt-1 text-[11px] text-muted">Filter to a specific workflow file. Leave empty to import all workflows.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1.5">Branch (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. develop"
                  value={newConnector.branch}
                  onChange={(e) => setNewConnector((prev) => ({ ...prev, branch: e.target.value }))}
                  className="w-full rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent"
                />
                <p className="mt-1 text-[11px] text-muted">Branch to filter test artifact sync. Default: main</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1.5">Max Runs (optional)</label>
                <input
                  type="number"
                  placeholder="10"
                  value={newConnector.maxRuns}
                  onChange={(e) => setNewConnector((prev) => ({ ...prev, maxRuns: e.target.value }))}
                  className="w-full rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent"
                />
                <p className="mt-1 text-[11px] text-muted">Number of recent runs to sync. Default: 10</p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">Artifact Pattern (optional)</label>
              <input
                type="text"
                placeholder="e.g. allure-results-shard-*, test-results, junit-*"
                value={newConnector.artifactPattern}
                onChange={(e) => setNewConnector((prev) => ({ ...prev, artifactPattern: e.target.value }))}
                className="w-full rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent"
              />
              <p className="mt-1 text-[11px] text-muted">Artifact name pattern to download (supports * wildcard). Default: auto-detects Allure shards, then falls back to JUnit XML artifacts.</p>
            </div>
            <div className="rounded-md border border-rag-amber/30 bg-rag-amber/5 px-3 py-2.5">
              <p className="text-xs text-secondary">
                <span className="font-medium text-rag-amber">Note:</span>{' '}
                GitHub sync can take several minutes, especially when downloading Allure artifacts. Each workflow run requires multiple API calls (jobs, artifacts, zip downloads). Reduce <span className="font-medium">Max Runs</span> if sync is too slow.
              </p>
            </div>
          </>
        );
      case 'testrail':
        return (
          <>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">TestRail URL</label>
              <input
                type="text"
                placeholder="https://your-instance.testrail.io"
                value={newConnector.url}
                onChange={(e) => setNewConnector((prev) => ({ ...prev, url: e.target.value }))}
                className="w-full rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">Username / Email</label>
              <input
                type="text"
                placeholder="user@example.com"
                value={newConnector.username}
                onChange={(e) => setNewConnector((prev) => ({ ...prev, username: e.target.value }))}
                className="w-full rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">API Key</label>
              <input
                type="password"
                placeholder="Your TestRail API key"
                value={newConnector.apiKey}
                onChange={(e) => setNewConnector((prev) => ({ ...prev, apiKey: e.target.value }))}
                className="w-full rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">TestRail Project ID</label>
              <input
                type="text"
                placeholder="e.g. 1"
                value={newConnector.projectId}
                onChange={(e) => setNewConnector((prev) => ({ ...prev, projectId: e.target.value }))}
                className="w-full rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent"
              />
              <p className="mt-1 text-[11px] text-muted">The numeric project ID from TestRail (visible in the URL when viewing a project)</p>
            </div>
          </>
        );
      case 'jira':
      case 'jira_stories':
        return (
          <>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">Jira URL</label>
              <input
                type="text"
                placeholder="https://your-org.atlassian.net"
                value={newConnector.url}
                onChange={(e) => setNewConnector((prev) => ({ ...prev, url: e.target.value }))}
                className="w-full rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">Email</label>
              <input
                type="text"
                placeholder="user@example.com"
                value={newConnector.username}
                onChange={(e) => setNewConnector((prev) => ({ ...prev, username: e.target.value }))}
                className="w-full rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">API Token</label>
              <input
                type="password"
                placeholder="Atlassian API token"
                value={newConnector.token}
                onChange={(e) => setNewConnector((prev) => ({ ...prev, token: e.target.value }))}
                className="w-full rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">Project Key</label>
              <input
                type="text"
                placeholder="e.g. PS, PROJ"
                value={newConnector.projectKey}
                onChange={(e) => setNewConnector((prev) => ({ ...prev, projectKey: e.target.value }))}
                className="w-full rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent"
              />
              <p className="mt-1 text-[11px] text-muted">
                {newConnector.type === 'jira_stories'
                  ? 'Jira project key used to filter stories (e.g. "project = PS AND issuetype = Story")'
                  : 'Jira project key used to filter bugs (e.g. "project = PS AND issuetype = Bug")'}
              </p>
            </div>
            {newConnector.type === 'jira' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1.5">Issue Type</label>
                  <input
                    type="text"
                    placeholder="e.g. Bug, Defect, or Bug, Defect, Issue"
                    value={newConnector.issueType}
                    onChange={(e) => setNewConnector((prev) => ({ ...prev, issueType: e.target.value }))}
                    className="w-full rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent"
                  />
                  <p className="mt-1 text-[11px] text-muted">
                    Jira issue type to fetch as defects. Supports comma-separated values for multiple types. Default: Bug
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1.5">Escaped Defect Label</label>
                  <input
                    type="text"
                    placeholder="e.g. production, escaped, found-in-prod"
                    value={newConnector.escapedLabel}
                    onChange={(e) => setNewConnector((prev) => ({ ...prev, escapedLabel: e.target.value }))}
                    className="w-full rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent"
                  />
                  <p className="mt-1 text-[11px] text-muted">
                    Jira label that marks a bug as escaped to production. Defects with this label (or &quot;production&quot; in the environment field) count toward the escape rate. Defaults to &quot;production&quot; if empty.
                  </p>
                </div>
              </>
            )}
            {newConnector.type === 'jira_stories' && (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-secondary mb-1.5">Story Issue Type</label>
                    <input
                      type="text"
                      placeholder="e.g. Story"
                      value={newConnector.storyIssueType}
                      onChange={(e) => setNewConnector((prev) => ({ ...prev, storyIssueType: e.target.value }))}
                      className="w-full rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent"
                    />
                    <p className="mt-1 text-[11px] text-muted">Default: Story</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-secondary mb-1.5">Epic Issue Type</label>
                    <input
                      type="text"
                      placeholder="e.g. Epic"
                      value={newConnector.epicIssueType}
                      onChange={(e) => setNewConnector((prev) => ({ ...prev, epicIssueType: e.target.value }))}
                      className="w-full rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent"
                    />
                    <p className="mt-1 text-[11px] text-muted">Default: Epic</p>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1.5">Story Points Field ID</label>
                  <input
                    type="text"
                    placeholder="e.g. customfield_10016"
                    value={newConnector.storyPointsField}
                    onChange={(e) => setNewConnector((prev) => ({ ...prev, storyPointsField: e.target.value }))}
                    className="w-full rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent"
                  />
                  <p className="mt-1 text-[11px] text-muted">Custom field ID for story points in your Jira instance. Default: customfield_10016</p>
                </div>
              </>
            )}
          </>
        );
      case 'junit_xml':
      case 'testng_xml':
        return (
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">File / Directory Path</label>
            <input
              type="text"
              placeholder="/path/to/reports/*.xml"
              value={newConnector.filePath}
              onChange={(e) => setNewConnector((prev) => ({ ...prev, filePath: e.target.value }))}
              className="w-full rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent"
            />
          </div>
        );
      default:
        return null;
    }
  };

  if (connectors.length === 0 && !showAddForm) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={<Plug2 className="h-10 w-10" />}
          title="No connectors configured"
          description={readOnly
            ? "No connectors have been configured for this project yet. Contact an administrator to set up data sources."
            : "Connect your test management tools, CI/CD pipelines, and defect trackers to import real data."}
          action={
            !readOnly ? (
              <div className="flex items-center gap-2">
                <Button onClick={() => setShowAddForm(true)}>
                  <Plus className="h-4 w-4" />
                  Add Connector
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={importing}
                  onClick={() => importInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {importing ? 'Importing...' : 'Import'}
                </Button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleImport}
                />
              </div>
            ) : undefined
          }
        />
        {importMessage && (
          <div className={cn(
            'rounded-md border px-3 py-2 text-xs font-medium',
            importMessage.type === 'success'
              ? 'border-rag-green/30 bg-rag-green/5 text-rag-green'
              : 'border-rag-red/30 bg-rag-red/5 text-rag-red',
          )}>
            {importMessage.text}
          </div>
        )}

        <Card padding="lg">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
            <div className="space-y-2 text-sm text-secondary">
              <p className="font-medium text-primary">Supported connectors</p>
              <ul className="space-y-1.5">
                <li className="flex items-center gap-2">
                  <Github className="h-3.5 w-3.5 text-muted" />
                  <span><span className="text-primary">GitHub</span> - Pull test results from GitHub Actions workflows</span>
                </li>
                <li className="flex items-center gap-2">
                  <TestTube2 className="h-3.5 w-3.5 text-muted" />
                  <span><span className="text-primary">TestRail</span> - Import test cases, runs, and results</span>
                </li>
                <li className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-muted" />
                  <span><span className="text-primary">Jira Defects</span> - Sync bugs and defect tracking</span>
                </li>
                <li className="flex items-center gap-2">
                  <BookOpen className="h-3.5 w-3.5 text-muted" />
                  <span><span className="text-primary">Jira Stories</span> - Sync user stories and requirements</span>
                </li>
                <li className="flex items-center gap-2">
                  <FileCode2 className="h-3.5 w-3.5 text-muted" />
                  <span><span className="text-primary">JUnit XML / TestNG XML</span> - Parse CI report artifacts</span>
                </li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {saveMessage && (
        <div className="flex items-center gap-2 rounded-md border border-rag-green/30 bg-rag-green/5 px-4 py-2.5 text-sm text-rag-green">
          <RefreshCw className="h-3.5 w-3.5" />
          {saveMessage}
        </div>
      )}

      {/* Connector list */}
      {connectors.length > 0 && (
        <div className="space-y-3">
          {connectors.map((connector) => {
            const Icon = CONNECTOR_ICONS[connector.type];
            const statusVariant =
              connector.status === 'active'
                ? 'success'
                : connector.status === 'paused'
                  ? 'neutral'
                  : 'error';
            const statusLabel =
              connector.status.charAt(0).toUpperCase() + connector.status.slice(1);

            return (
              <Card key={connector.id} padding="md">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-qod-bg border border-qod-border">
                    <Icon className="h-5 w-5 text-secondary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-primary truncate">
                        {connector.name}
                      </span>
                      <Badge variant={statusVariant}>{statusLabel}</Badge>
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-muted">
                      <span>{CONNECTOR_TYPE_LABELS[connector.type]}</span>
                      <span>Last sync: {connector.lastSyncAt ? formatRelativeTime(connector.lastSyncAt) : 'Pending'}</span>
                      <span>Schedule: {connector.syncSchedule} ({connector.syncTimezone})</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!readOnly && (
                      <Button variant="ghost" size="sm" title="Edit" onClick={() => startEditing(connector.id)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Sync Now"
                      disabled={syncingIds.has(connector.id)}
                      onClick={() => handleSync(connector.id)}
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", syncingIds.has(connector.id) && "animate-spin")} />
                    </Button>
                    {!readOnly && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          title={connector.status === 'paused' ? 'Resume' : 'Pause'}
                          onClick={() => handleTogglePause(connector)}
                        >
                          {connector.status === 'paused' ? (
                            <Play className="h-3.5 w-3.5" />
                          ) : (
                            <Pause className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button variant="ghost" size="sm" title="Delete" className="text-rag-red hover:text-rag-red" onClick={() => handleDelete(connector.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {/* Sync progress / status banner */}
                {(syncingIds.has(connector.id) || syncMessages.has(connector.id)) && (() => {
                  const msg = syncMessages.get(connector.id);
                  const isSyncing = syncingIds.has(connector.id);
                  const hasLogs = syncLogs.has(connector.id);
                  return (
                    <div className={cn(
                      'mt-3 rounded-md border px-3 py-2',
                      msg?.type === 'error'
                        ? 'border-rag-red/30 bg-rag-red/5'
                        : 'border-qod-border bg-qod-bg',
                    )}>
                      {isSyncing && (
                        <div className="mb-1.5 h-1.5 w-full overflow-hidden rounded-full bg-qod-border">
                          <div className="h-full animate-progress-indeterminate rounded-full bg-qod-accent" />
                        </div>
                      )}
                      {msg && (
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            {msg.type === 'error' && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rag-red" />}
                            <p className={cn(
                              'text-xs font-medium',
                              msg.type === 'info' && 'text-qod-accent',
                              msg.type === 'success' && 'text-rag-green',
                              msg.type === 'error' && 'text-rag-red',
                            )}>
                              {msg.text}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            {hasLogs && (
                              <button
                                type="button"
                                className="shrink-0 text-muted hover:text-primary"
                                title="View sync log"
                                onClick={() => setLogModalId(connector.id)}
                              >
                                <ScrollText className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {!isSyncing && (
                              <button
                                type="button"
                                className="shrink-0 text-muted hover:text-primary"
                                onClick={() => setSyncMessages((prev) => { const next = new Map(prev); next.delete(connector.id); return next; })}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Connector Form */}
      {showAddForm ? (
        <Card padding="lg">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-primary">{editingId ? 'Edit Connector' : 'Add Connector'}</h3>
            <button
              onClick={resetForm}
              className="rounded p-1 text-muted hover:text-primary hover:bg-qod-bg transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Connector Type */}
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">Connector Type</label>
              {editingId ? (
                <div className="rounded-md border border-qod-border bg-qod-bg px-3 py-2 text-sm text-secondary">
                  {CONNECTOR_TYPE_OPTIONS.find((o) => o.value === newConnector.type)?.label ?? newConnector.type}
                </div>
              ) : (
                <Select
                  options={CONNECTOR_TYPE_OPTIONS}
                  value={newConnector.type}
                  onChange={(val) => setNewConnector((prev) => ({ ...prev, type: val }))}
                  placeholder="Select connector type..."
                />
              )}
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">Name</label>
              <input
                type="text"
                placeholder="e.g. Production CI Pipeline"
                value={newConnector.name}
                onChange={(e) => setNewConnector((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent"
              />
            </div>

            {/* Credential fields (vary by type) */}
            {newConnector.type && (
              <>
                <div className="border-t border-qod-border pt-4">
                  <h4 className="text-xs font-medium text-secondary mb-3">Credentials</h4>
                  <div className="space-y-3">{renderCredentialFields()}</div>
                </div>

                {/* Sync Schedule */}
                <div className="border-t border-qod-border pt-4">
                  <label className="block text-xs font-medium text-secondary mb-1.5">Sync Schedule</label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Select
                      options={SCHEDULE_PRESETS}
                      value={newConnector.schedule}
                      onChange={(val) => setNewConnector((prev) => ({ ...prev, schedule: val }))}
                    />
                    <Select
                      options={TIMEZONE_OPTIONS}
                      value={newConnector.timezone}
                      onChange={(val) => setNewConnector((prev) => ({ ...prev, timezone: val }))}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted">
                    Cron expression: <code className="rounded bg-qod-bg px-1 py-0.5 font-mono text-muted">{newConnector.schedule}</code>
                    {' '}in <span className="font-medium text-secondary">{newConnector.timezone}</span>
                  </p>
                </div>

                {/* Field Mappings */}
                <div className="border-t border-qod-border pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-medium text-secondary">Field Mappings</h4>
                    <button
                      onClick={addFieldMapping}
                      className="text-xs text-qod-accent hover:text-qod-accent/80 transition-colors"
                    >
                      + Add mapping
                    </button>
                  </div>
                  <div className="space-y-2">
                    {newConnector.fieldMappings.map((mapping, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Source field"
                          value={mapping.key}
                          onChange={(e) => updateFieldMapping(idx, 'key', e.target.value)}
                          className="flex-1 rounded-md border border-qod-border bg-qod-surface px-3 py-1.5 text-xs text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent"
                        />
                        <span className="text-muted text-xs">&rarr;</span>
                        <input
                          type="text"
                          placeholder="QOD field"
                          value={mapping.value}
                          onChange={(e) => updateFieldMapping(idx, 'value', e.target.value)}
                          className="flex-1 rounded-md border border-qod-border bg-qod-surface px-3 py-1.5 text-xs text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent"
                        />
                        {newConnector.fieldMappings.length > 1 && (
                          <button
                            onClick={() => removeFieldMapping(idx)}
                            className="rounded p-1 text-muted hover:text-rag-red transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-qod-border pt-4">
              <Button variant="secondary" size="sm" onClick={resetForm}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!newConnector.type || !newConnector.name || saving}
                onClick={async () => {
                  if (!newConnector.type || !newConnector.name) return;
                  setSaving(true);
                  try {
                    const credentials: Record<string, string> = {};
                    if (newConnector.url) credentials.url = newConnector.url;
                    if (newConnector.username) credentials.username = newConnector.username;
                    if (newConnector.apiKey) credentials.apiKey = newConnector.apiKey;
                    if (newConnector.token) credentials.token = newConnector.token;
                    if (newConnector.filePath) credentials.filePath = newConnector.filePath;
                    if (newConnector.projectId) credentials.projectId = newConnector.projectId;
                    if (newConnector.projectKey) credentials.projectKey = newConnector.projectKey;
                    if (newConnector.workflowFile) credentials.workflowFile = newConnector.workflowFile;
                    if (newConnector.branch) credentials.branch = newConnector.branch;
                    if (newConnector.maxRuns) (credentials as Record<string, unknown>).maxRuns = parseInt(newConnector.maxRuns, 10);
                    if (newConnector.escapedLabel) credentials.escapedLabel = newConnector.escapedLabel;
                    if (newConnector.issueType) credentials.issueType = newConnector.issueType;
                    if (newConnector.storyIssueType) credentials.storyIssueType = newConnector.storyIssueType;
                    if (newConnector.epicIssueType) credentials.epicIssueType = newConnector.epicIssueType;
                    if (newConnector.storyPointsField) credentials.storyPointsField = newConnector.storyPointsField;
                    if (newConnector.artifactPattern) credentials.artifactPattern = newConnector.artifactPattern;

                    const fieldMapping: Record<string, string> = {};
                    for (const m of newConnector.fieldMappings) {
                      if (m.key && m.value) fieldMapping[m.key] = m.value;
                    }

                    const payload = {
                      connectorType: newConnector.type.toUpperCase(),
                      name: newConnector.name,
                      credentials,
                      fieldMapping: Object.keys(fieldMapping).length > 0 ? fieldMapping : undefined,
                      syncSchedule: newConnector.schedule,
                      syncTimezone: newConnector.timezone,
                    };

                    if (editingId) {
                      await apiClient(`/api/v1/projects/${projectId}/connectors/${editingId}`, {
                        method: 'PATCH',
                        body: JSON.stringify(payload),
                      });
                    } else {
                      await apiClient(`/api/v1/projects/${projectId}/connectors`, {
                        method: 'POST',
                        body: JSON.stringify(payload),
                      });
                    }
                    const isJira = newConnector.type.toUpperCase() === 'JIRA';
                    resetForm();
                    await queryClient.invalidateQueries({ queryKey: ['connectors', projectId] });
                    // Escaped label changes recompute isEscaped + KPIs on the backend —
                    // invalidate defects and KPI caches so navigating to those pages shows fresh data.
                    if (isJira) {
                      queryClient.invalidateQueries({ queryKey: ['defects'] });
                      queryClient.invalidateQueries({ queryKey: ['kpi-dashboard'] });
                      queryClient.invalidateQueries({ queryKey: ['defect-filter-options'] });
                      setSaveMessage('Escaped defects recalculated. KPI metrics updated.');
                      setTimeout(() => setSaveMessage(null), 5000);
                    }
                  } catch (err) {
                    console.error('Failed to save connector:', err);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {editingId ? (
                  <Save className="h-3.5 w-3.5" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Connector'}
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {!readOnly && (
            <div className="flex items-center gap-2">
              <Button onClick={() => setShowAddForm(true)}>
                <Plus className="h-4 w-4" />
                Add Connector
              </Button>
              {connectors.length > 0 && (
                <Button variant="secondary" size="sm" onClick={handleExport}>
                  <Download className="h-3.5 w-3.5" />
                  Export
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                disabled={importing}
                onClick={() => importInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                {importing ? 'Importing...' : 'Import'}
              </Button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImport}
            />
          </div>
          )}
          {!readOnly && importMessage && (
            <div className={cn(
              'rounded-md border px-3 py-2 text-xs font-medium',
              importMessage.type === 'success'
                ? 'border-rag-green/30 bg-rag-green/5 text-rag-green'
                : 'border-rag-red/30 bg-rag-red/5 text-rag-red',
            )}>
              {importMessage.text}
            </div>
          )}
        </div>
      )}

      {/* Sync Log Modal */}
      {logModalId && (() => {
        const logs = syncLogs.get(logModalId) ?? [];
        const connName = connectors.find((c) => c.id === logModalId)?.name ?? 'Connector';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setLogModalId(null)}>
            <div
              className="mx-4 w-full max-w-lg rounded-lg border border-qod-border bg-qod-surface shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-qod-border px-4 py-3">
                <h3 className="text-sm font-semibold text-primary">Sync Log — {connName}</h3>
                <button onClick={() => setLogModalId(null)} className="rounded p-1 text-muted hover:text-primary hover:bg-qod-bg">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto px-4 py-3">
                {logs.length === 0 ? (
                  <p className="text-xs text-muted">No log entries.</p>
                ) : (
                  <div className="space-y-1 font-mono text-xs">
                    {logs.map((line, i) => (
                      <div key={i} className={cn(
                        'rounded px-2 py-1',
                        line.startsWith('Error') ? 'bg-rag-red/10 text-rag-red' :
                        line.includes('completed') ? 'bg-rag-green/10 text-rag-green' :
                        line.includes('Fetched') || line.includes('created') ? 'text-primary' :
                        'text-secondary',
                      )}>
                        {line}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── KPI Thresholds Tab ──────────────────────────────────────────────

function KPIThresholdsTab() {
  const [thresholds, setThresholds] = useState<KPIThreshold[]>(DEFAULT_KPI_THRESHOLDS);
  const [saved, setSaved] = useState(false);

  const updateThreshold = (
    index: number,
    field: 'target' | 'greenThreshold' | 'amberThreshold',
    value: string,
  ) => {
    const num = parseFloat(value);
    if (isNaN(num) && value !== '') return;
    setThresholds((prev) =>
      prev.map((t, i) =>
        i === index ? { ...t, [field]: value === '' ? 0 : num } : t,
      ),
    );
    setSaved(false);
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-primary">KPI Thresholds</h3>
          <p className="mt-0.5 text-xs text-muted">
            Configure target values and RAG status thresholds for each metric.
          </p>
        </div>
        <Button size="sm" onClick={handleSave}>
          <Save className="h-3.5 w-3.5" />
          {saved ? 'Saved!' : 'Save Thresholds'}
        </Button>
      </div>

      <Card padding="sm" className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-qod-border">
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-secondary">
                Metric
              </th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-secondary text-right">
                Current
              </th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-secondary text-right">
                Target
              </th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-secondary text-right">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-rag-green" />
                  Green
                </span>
              </th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-secondary text-right">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-rag-amber" />
                  Amber
                </span>
              </th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-secondary text-center">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {thresholds.map((kpi, idx) => {
              const rag = computeRAG(
                kpi.currentValue,
                kpi.greenThreshold,
                kpi.amberThreshold,
                kpi.lowerIsBetter,
              );
              return (
                <tr
                  key={kpi.metric}
                  className={cn(
                    'border-b border-qod-border/50 transition-colors',
                    idx % 2 === 1 && 'bg-qod-bg/30',
                  )}
                >
                  <td className="px-4 py-3">
                    <div>
                      <span className="text-sm font-medium text-primary">{kpi.label}</span>
                      <div className="text-[11px] text-muted mt-0.5">
                        {kpi.lowerIsBetter ? 'Lower is better' : 'Higher is better'}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-mono text-secondary">
                      {kpi.currentValue}
                      <span className="text-muted ml-0.5">{kpi.unit}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <input
                      type="number"
                      step="any"
                      value={kpi.target}
                      onChange={(e) => updateThreshold(idx, 'target', e.target.value)}
                      className="w-20 rounded border border-qod-border bg-qod-surface px-2 py-1 text-right text-sm font-mono text-primary focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <input
                      type="number"
                      step="any"
                      value={kpi.greenThreshold}
                      onChange={(e) => updateThreshold(idx, 'greenThreshold', e.target.value)}
                      className="w-20 rounded border border-rag-green/30 bg-rag-green/5 px-2 py-1 text-right text-sm font-mono text-primary focus:outline-none focus:ring-1 focus:ring-rag-green focus:border-rag-green"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <input
                      type="number"
                      step="any"
                      value={kpi.amberThreshold}
                      onChange={(e) => updateThreshold(idx, 'amberThreshold', e.target.value)}
                      className="w-20 rounded border border-rag-amber/30 bg-rag-amber/5 px-2 py-1 text-right text-sm font-mono text-primary focus:outline-none focus:ring-1 focus:ring-rag-amber focus:border-rag-amber"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={ragToBadgeVariant(rag)}>{rag}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card padding="md">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
          <div className="text-xs text-secondary space-y-1">
            <p className="font-medium text-primary">How thresholds work</p>
            <p>
              For <span className="text-primary">higher-is-better</span> metrics (e.g. Pass Rate), values at or above the green threshold
              are <span className="text-rag-green font-medium">GREEN</span>, values between green and amber
              are <span className="text-rag-amber font-medium">AMBER</span>, and values below amber
              are <span className="text-rag-red font-medium">RED</span>.
            </p>
            <p>
              For <span className="text-primary">lower-is-better</span> metrics (e.g. Flaky Rate), values at or below the green threshold
              are <span className="text-rag-green font-medium">GREEN</span>, values between green and amber
              are <span className="text-rag-amber font-medium">AMBER</span>, and values above amber
              are <span className="text-rag-red font-medium">RED</span>.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── General Tab ─────────────────────────────────────────────────────

function GeneralTab() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { data: project } = useProject(id);

  const [projectName, setProjectName] = useState(project?.name ?? 'Project');
  const [description, setDescription] = useState(project?.description ?? '');
  const [retention, setRetention] = useState('365');
  const [saved, setSaved] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const retentionOptions = [
    { value: '90', label: '90 days' },
    { value: '180', label: '180 days' },
    { value: '365', label: '1 year' },
    { value: '730', label: '2 years' },
  ];

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Project Details */}
      <Card padding="lg">
        <h3 className="text-sm font-semibold text-primary mb-4">Project Details</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Project Name</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => { setProjectName(e.target.value); setSaved(false); }}
              className="w-full max-w-md rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => { setDescription(e.target.value); setSaved(false); }}
              className="w-full rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent resize-none"
              placeholder="Describe what this project covers..."
            />
          </div>
        </div>
      </Card>

      {/* Data Settings */}
      <Card padding="lg">
        <h3 className="text-sm font-semibold text-primary mb-4">Data Settings</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Data Retention Period</label>
            <Select
              options={retentionOptions}
              value={retention}
              onChange={(val) => { setRetention(val); setSaved(false); }}
              className="max-w-xs"
            />
            <p className="mt-1.5 text-[11px] text-muted">
              Test results and metrics older than this period will be archived.
            </p>
          </div>
        </div>
      </Card>

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={handleSave}>
          <Save className="h-4 w-4" />
          {saved ? 'Saved!' : 'Save Changes'}
        </Button>
      </div>

      {/* Danger Zone */}
      <Card padding="lg" className="border-rag-red/30">
        <h3 className="text-sm font-semibold text-rag-red mb-1">Danger Zone</h3>
        <p className="text-xs text-muted mb-4">
          These actions are irreversible. Please proceed with caution.
        </p>

        {showDeleteConfirm ? (
          <div className="space-y-3 rounded-lg border border-rag-red/20 bg-rag-red/5 p-4">
            <p className="text-sm text-secondary">
              To confirm deletion, type the project name: <span className="font-mono font-semibold text-primary">{projectName}</span>
            </p>
            <input
              type="text"
              placeholder="Type project name to confirm..."
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="w-full max-w-md rounded-md border border-rag-red/30 bg-qod-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-rag-red focus:border-rag-red"
            />
            <div className="flex items-center gap-2">
              <Button
                variant="danger"
                size="sm"
                disabled={deleteConfirmText !== projectName}
                onClick={async () => {
                  try {
                    await apiClient(`/api/v1/projects/${id}`, { method: 'DELETE' });
                    window.location.href = '/projects';
                  } catch (err) {
                    alert('Failed to delete project');
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Project Permanently
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setShowDeleteConfirm(true)}>
            <Trash2 className="h-4 w-4" />
            Delete Project
          </Button>
        )}
      </Card>
    </div>
  );
}

// ─── KPI Formulas Tab ────────────────────────────────────────────────
// The full configurator (registry rendering, parameter forms, live preview)
// lives in `_components/kpi-formula-configurator/`. This wrapper only owns
// the page's read-only / admin gating.

function KPIFormulasTab({ projectId, readOnly }: { projectId: string; readOnly: boolean }) {
  return <KPIFormulaConfigurator projectId={projectId} readOnly={readOnly} />;
}

// Legacy reference cards (TESTING_FORMULAS, DEFECT_FORMULAS,
// COMPOSITE_FORMULAS, FormulaCard) lived here previously; their content
// now sources from the @qod/shared registry consumed by the configurator.

// ─── Main Page ───────────────────────────────────────────────────────

export default function ProjectSettingsPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const [activeTab, setActiveTab] = useState('connectors');
  const { demoMode } = useDemoMode();
  const { isAdmin } = useAuth();

  const isEditableTab =
    activeTab === 'connectors' ||
    activeTab === 'kpi-thresholds' ||
    activeTab === 'kpi-formulas' ||
    activeTab === 'general';

  const formulasReadOnly = demoMode || !isAdmin;

  return (
    <div className="space-y-6">
      <Tabs tabs={settingsTabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {(demoMode || !isAdmin) && isEditableTab && (
        <div className="flex items-center gap-2 rounded-md border border-rag-amber/30 bg-rag-amber/5 px-4 py-2.5 text-sm text-rag-amber">
          <Info className="h-3.5 w-3.5 shrink-0" />
          {demoMode
            ? 'Settings are read-only in demo mode. Disable demo mode to make changes.'
            : activeTab === 'connectors'
              ? 'Connector configuration is read-only. You can trigger sync for configured connectors.'
              : activeTab === 'kpi-formulas'
                ? 'Formula editing is read-only. You can still tweak parameters to see the live preview, but saving requires admin access.'
                : 'Settings are read-only. Only administrators can modify settings.'}
        </div>
      )}

      {/* Connectors tab: members can sync but not edit — rendered outside the inert wrapper */}
      {activeTab === 'connectors' && <ConnectorsTab projectId={id} readOnly={!isAdmin || demoMode} />}

      {/* KPI Formulas: rendered outside the inert wrapper so the live preview
          stays interactive even in read-only mode. The configurator handles
          its own admin gating via the `readOnly` prop. */}
      {activeTab === 'kpi-formulas' && (
        <KPIFormulasTab projectId={id} readOnly={formulasReadOnly} />
      )}

      {/* Other editable tabs: fully locked for non-admins */}
      <div
        className={
          (demoMode || !isAdmin) && isEditableTab && activeTab !== 'connectors' && activeTab !== 'kpi-formulas'
            ? 'pointer-events-none opacity-50'
            : ''
        }
        // eslint-disable-next-line
        {...((demoMode || !isAdmin) && isEditableTab && activeTab !== 'connectors' && activeTab !== 'kpi-formulas'
          ? { inert: '' as any }
          : {})}
      >
        {activeTab === 'kpi-thresholds' && <KPIThresholdsTab />}
        {activeTab === 'general' && <GeneralTab />}
      </div>
    </div>
  );
}
