'use client';

import { useState, useMemo, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Layers, Loader2, BookOpen, Target, ChevronRight, ChevronDown, ChevronLeft } from 'lucide-react';
import { useCoverageData, useTestCases, useTestCaseFilterOptions, useStories, useStoryFilterOptions, useEpicCoverage } from '@/lib/api/hooks';
import type { EpicCoverage, EpicStory } from '@/lib/api/hooks';
import { CoverageHeatmap } from '@/components/charts';
import {
  Card,
  Badge,
  DataTable,
  Select,
  SearchInput,
  StatCard,
} from '@/components/ui';
import { Tabs, type Tab } from '@/components/ui/tabs';
import { FilterSheet } from '@/components/layout/filter-sheet';
import type { DataTableColumn } from '@/components/ui/data-table';
import type { DemoTestCase, DemoStory } from '@qod/shared';
import { TestHistoryDrawer } from '@/components/test-history-drawer';

// ── Helpers ────────────────────────────────────────────────────────────

function automationBadgeVariant(status: string): 'success' | 'warning' | 'error' | 'neutral' {
  switch (status) {
    case 'AUTOMATED': return 'success';
    case 'NOT_AUTOMATED': return 'error';
    case 'NEEDS_UPDATE': return 'warning';
    default: return 'neutral';
  }
}

function storyStatusBadgeVariant(status: string): 'success' | 'warning' | 'error' | 'neutral' {
  switch (status) {
    case 'CLOSED': return 'success';
    case 'RESOLVED': return 'success';
    case 'IN_PROGRESS': return 'warning';
    case 'OPEN': return 'neutral';
    case 'REOPENED': return 'error';
    default: return 'neutral';
  }
}

const coverageTabs: Tab[] = [
  { id: 'test-cases', label: 'Test Cases', icon: <Layers className="h-3.5 w-3.5" /> },
  { id: 'stories', label: 'Stories', icon: <BookOpen className="h-3.5 w-3.5" /> },
  { id: 'epics', label: 'Epics', icon: <Target className="h-3.5 w-3.5" /> },
];

// ── Main page component ─────────────────────────────────────────────────

export default function CoveragePage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const projectId = params?.id ?? '';

  const [activeTab, setActiveTab] = useState('test-cases');
  const [heatmapPage, setHeatmapPage] = useState(0);

  const { data: coverageData, isLoading: coverageLoading } = useCoverageData(projectId);
  const { data: filterOptions } = useTestCaseFilterOptions(projectId);
  const [suiteFilter, setSuiteFilter] = useState('');
  const [testRailTypeFilter, setTestRailTypeFilter] = useState('');
  const [referencesFilter, setReferencesFilter] = useState('');
  const [referenceSearch, setReferenceSearch] = useState('');
  const [search, setSearch] = useState(searchParams?.get('search') ?? '');
  const [page, setPage] = useState(1);
  const [drawerTestId, setDrawerTestId] = useState<string | null>(searchParams?.get('testCaseId') ?? null);
  const [drawerTestTitle, setDrawerTestTitle] = useState(searchParams?.get('search') ?? '');

  // Stories state
  const [storySearch, setStorySearch] = useState('');
  const [storyStatusFilter, setStoryStatusFilter] = useState('');
  const [storyComponentFilter, setStoryComponentFilter] = useState('');
  const [storyLabelFilter, setStoryLabelFilter] = useState('');
  const [storyPage, setStoryPage] = useState(1);

  // Auto-open drawer when navigated with testCaseId query param
  useEffect(() => {
    const testCaseId = searchParams?.get('testCaseId');
    const searchQ = searchParams?.get('search');
    if (testCaseId) {
      setDrawerTestId(testCaseId);
      if (searchQ) {
        setDrawerTestTitle(searchQ);
        setSearch(searchQ);
      }
    }
  }, [searchParams]);

  const { data: testCasesData, isLoading: casesLoading } = useTestCases(projectId, {
    suiteName: suiteFilter || undefined,
    testRailType: testRailTypeFilter || undefined,
    hasReferences: referencesFilter === 'true' ? true : referencesFilter === 'false' ? false : undefined,
    referenceSearch: referenceSearch || undefined,
    search: search || undefined,
    page,
    pageSize: 20,
  });

  const { data: storiesData, isLoading: storiesLoading } = useStories(projectId, {
    status: (storyStatusFilter || undefined) as any,
    component: storyComponentFilter || undefined,
    label: storyLabelFilter || undefined,
    search: storySearch || undefined,
    page: storyPage,
    pageSize: 20,
  });

  const { data: storyFilterOptions } = useStoryFilterOptions(projectId);

  const { data: epicCoverageData, isLoading: epicCoverageLoading } = useEpicCoverage(projectId);

  // ── Summary stats ──────────────────────────────────────────────────

  const stats = useMemo(() => {
    if (!coverageData || coverageData.length === 0) return null;
    const totalCases = coverageData.reduce((s, c) => s + c.totalTestCases, 0);
    const automated = coverageData.reduce((s, c) => s + c.automatedCount, 0);
    const manual = coverageData.reduce((s, c) => s + c.manualCount, 0);
    const pct = totalCases > 0 ? Math.round((automated / totalCases) * 1000) / 10 : null;
    return { totalCases, automated, manual, pct };
  }, [coverageData]);

  // ── Dropdown options (from dedicated filter-options endpoint) ───────

  const suiteOptions = useMemo(() => [
    { value: '', label: 'All Suites' },
    ...(filterOptions?.suiteNames ?? []).map((s) => ({
      value: s,
      label: s.length > 20 ? s.slice(0, 18) + '…' : s,
    })),
  ], [filterOptions]);

  const testRailTypeOptions = useMemo(() => [
    { value: '', label: 'All Types (TR)' },
    ...(filterOptions?.testRailTypes ?? []).map((t) => ({ value: t, label: t })),
  ], [filterOptions]);

  // Story component options from dedicated filter-options endpoint (all components, not just current page)
  const storyComponentOptions = useMemo(() => [
    { value: '', label: 'All Components' },
    ...(storyFilterOptions?.components ?? []).map((c) => ({ value: c, label: c })),
  ], [storyFilterOptions]);

  const storyLabelOptions = useMemo(() => [
    { value: '', label: 'All Labels' },
    ...(storyFilterOptions?.labels ?? []).map((l) => ({ value: l, label: l })),
  ], [storyFilterOptions]);

  // ── Heatmap data ───────────────────────────────────────────────────

  const HEATMAP_PAGE_SIZE = 20;
  const heatmapTotalPages = coverageData ? Math.ceil(coverageData.length / HEATMAP_PAGE_SIZE) : 0;

  const heatmapData = useMemo(() => {
    if (!coverageData) return [];
    const start = heatmapPage * HEATMAP_PAGE_SIZE;
    return coverageData.slice(start, start + HEATMAP_PAGE_SIZE).map((c) => ({
      name: c.featureAreaName,
      automated: c.automatedCount,
      manual: c.manualCount,
      total: c.totalTestCases,
      coverage: Math.round(c.automationPct),
    }));
  }, [coverageData, heatmapPage]);

  // ── Test Case table columns ────────────────────────────────────────

  const testCaseColumns: DataTableColumn<DemoTestCase>[] = useMemo(() => [
    {
      key: 'externalId',
      header: 'ID',
      render: (row) => <span className="text-xs font-mono text-muted max-w-[200px] break-words inline-block">{row.externalId ? `C${row.externalId}` : '—'}</span>,
    },
    {
      key: 'title',
      header: 'Test Case',
      render: (row) => (
        <button
          type="button"
          className="text-left text-sm text-qod-accent hover:underline"
          onClick={() => { setDrawerTestId(row.id); setDrawerTestTitle(row.title); }}
        >
          {row.title}
        </button>
      ),
    },
    {
      key: 'automationStatus',
      header: 'Automation',
      render: (row) => <Badge variant={automationBadgeVariant(row.automationStatus)}>{row.automationStatus.replace(/_/g, ' ')}</Badge>,
    },
    {
      key: 'suiteName',
      header: 'Suite / Area',
      render: (row) => <span className="text-xs text-muted">{row.suiteName || '—'}</span>,
    },
    {
      key: 'testRailType',
      header: 'Type (TR)',
      render: (row) => <span className="text-xs text-muted">{row.testRailType || '—'}</span>,
    },
    {
      key: 'references',
      header: 'References',
      render: (row) => <span className="text-xs text-muted">{row.references || '—'}</span>,
    },
    {
      key: 'lastExecutedAt',
      header: 'Last Run',
      render: (row) => (
        <span className="text-xs text-muted">
          {row.lastExecutedAt
            ? new Date(row.lastExecutedAt).toLocaleDateString()
            : 'Never'}
        </span>
      ),
    },
  ], []);

  // ── Stories table columns ──────────────────────────────────────────

  const storyColumns: DataTableColumn<DemoStory>[] = useMemo(() => [
    {
      key: 'externalId',
      header: 'ID',
      className: 'whitespace-nowrap w-24',
      render: (row) => (
        <span className="text-xs font-mono text-muted">
          {row.url ? (
            <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-qod-accent hover:underline">
              {row.externalId}
            </a>
          ) : row.externalId}
        </span>
      ),
    },
    {
      key: 'title',
      header: 'Story',
      render: (row) => <span className="text-sm text-primary">{row.title}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      className: 'whitespace-nowrap',
      render: (row) => <Badge variant={storyStatusBadgeVariant(row.status)}>{row.status.replace(/_/g, ' ')}</Badge>,
    },
    {
      key: 'storyPoints',
      header: 'Points',
      render: (row) => <span className="text-xs text-muted">{row.storyPoints ?? '—'}</span>,
    },
    {
      key: 'assignee',
      header: 'Assignee',
      render: (row) => <span className="text-xs text-muted">{row.assignee || '—'}</span>,
    },
    {
      key: 'component',
      header: 'Component',
      render: (row) => <span className="text-xs text-muted">{row.component || '—'}</span>,
    },
    {
      key: 'labels',
      header: 'Labels',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.labels.length > 0
            ? row.labels.map((l) => (
                <span key={l} className="inline-block rounded bg-qod-surface px-1.5 py-0.5 text-[10px] text-muted">
                  {l}
                </span>
              ))
            : <span className="text-xs text-muted">—</span>}
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row) => (
        <span className="text-xs text-muted">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ], []);

  // ── Epic drill-down state ──────────────────────────────────────────
  const [expandedEpic, setExpandedEpic] = useState<string | null>(null);
  const [expandedStory, setExpandedStory] = useState<string | null>(null);
  const [epicSearch, setEpicSearch] = useState('');
  const [epicStatusFilter, setEpicStatusFilter] = useState('');
  const [epicCoverageFilter, setEpicCoverageFilter] = useState('');

  // Unique epic statuses for filter dropdown
  const epicStatusOptions = useMemo(() => {
    const statuses = new Set<string>();
    epicCoverageData?.forEach((e) => statuses.add(e.status));
    return [
      { value: '', label: 'All Statuses' },
      ...[...statuses].sort().map((s) => ({ value: s, label: s })),
    ];
  }, [epicCoverageData]);

  // Filter & sort epics
  const sortedEpics = useMemo(() => {
    if (!epicCoverageData) return [];
    let filtered = epicCoverageData;
    if (epicSearch) {
      const q = epicSearch.toLowerCase();
      filtered = filtered.filter(
        (e) => e.title.toLowerCase().includes(q) || e.externalId.toLowerCase().includes(q),
      );
    }
    if (epicStatusFilter) {
      filtered = filtered.filter((e) => e.status === epicStatusFilter);
    }
    if (epicCoverageFilter === 'with_tcs') {
      filtered = filtered.filter((e) => e.totalTCs > 0);
    } else if (epicCoverageFilter === 'no_tcs') {
      filtered = filtered.filter((e) => e.totalTCs === 0);
    }
    return [...filtered].sort((a, b) => b.totalTCs - a.totalTCs);
  }, [epicCoverageData, epicSearch, epicStatusFilter, epicCoverageFilter]);

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-primary">Test Coverage</h1>
        <p className="mt-0.5 text-xs text-muted">
          Automation coverage ratio and test case inventory by feature area.
        </p>
      </div>

      {/* Summary Cards */}
      {coverageLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-qod-border bg-qod-surface" />
          ))}
        </div>
      ) : stats && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Test Cases"
            value={String(stats.totalCases)}
            icon={<Layers className="h-3.5 w-3.5" />}
          />
          <StatCard
            title="Automated"
            value={stats.automated > 0 ? String(stats.automated) : 'N/A'}
            ragStatus={stats.automated > 0 ? 'green' : undefined}
            icon={<Layers className="h-3.5 w-3.5" />}
          />
          <StatCard
            title="Manual"
            value={stats.manual > 0 ? String(stats.manual) : 'N/A'}
            ragStatus={stats.manual > 0 ? 'amber' : undefined}
            icon={<Layers className="h-3.5 w-3.5" />}
          />
          <StatCard
            title="Automation Coverage"
            value={stats.pct != null ? `${stats.pct}%` : 'N/A'}
            ragStatus={stats.pct != null ? (stats.pct >= 80 ? 'green' : stats.pct >= 50 ? 'amber' : 'red') : undefined}
            icon={<Layers className="h-3.5 w-3.5" />}
          />
        </div>
      )}

      {/* Coverage Heatmap */}
      {coverageLoading ? (
        <div className="h-40 animate-pulse rounded-lg border border-qod-border bg-qod-surface" />
      ) : heatmapData.length > 0 && (
        <Card>
          <div className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-primary">
                Coverage by Feature Area
                {coverageData && coverageData.length > HEATMAP_PAGE_SIZE && (
                  <span className="ml-2 text-xs font-normal text-muted">
                    {heatmapPage * HEATMAP_PAGE_SIZE + 1}–{Math.min((heatmapPage + 1) * HEATMAP_PAGE_SIZE, coverageData.length)} of {coverageData.length}
                  </span>
                )}
              </h2>
              {heatmapTotalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setHeatmapPage((p) => Math.max(0, p - 1))}
                    disabled={heatmapPage === 0}
                    className="rounded-md border border-qod-border p-1 text-secondary transition-colors hover:bg-qod-bg disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="px-2 text-xs text-muted">
                    {heatmapPage + 1} / {heatmapTotalPages}
                  </span>
                  <button
                    onClick={() => setHeatmapPage((p) => Math.min(heatmapTotalPages - 1, p + 1))}
                    disabled={heatmapPage >= heatmapTotalPages - 1}
                    className="rounded-md border border-qod-border p-1 text-secondary transition-colors hover:bg-qod-bg disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
            <CoverageHeatmap data={heatmapData} />
          </div>
        </Card>
      )}

      {/* Subtabs */}
      <Tabs tabs={coverageTabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Test Cases Tab */}
      {activeTab === 'test-cases' && (
        <Card className="p-0">
          <div className="border-b border-qod-border px-4 py-3">
            <h2 className="text-sm font-semibold text-primary">Test Cases</h2>
          </div>

          {/* Filters — desktop inline row */}
          <div className="hidden md:flex items-center gap-2 border-b border-qod-border px-4 py-2">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search test cases..."
              className="min-w-0 flex-1"
            />
            <Select
              value={suiteFilter}
              onChange={(v) => { setSuiteFilter(v); setPage(1); }}
              options={suiteOptions}
              className="min-w-0 flex-1"
            />
            <Select
              value={testRailTypeFilter}
              onChange={(v) => { setTestRailTypeFilter(v); setPage(1); }}
              options={testRailTypeOptions}
              className="w-32 shrink-0"
            />
            <Select
              value={referencesFilter}
              onChange={(v) => { setReferencesFilter(v); setPage(1); }}
              options={[
                { value: '', label: 'All Refs' },
                { value: 'true', label: 'Has Ref' },
                { value: 'false', label: 'No Ref' },
              ]}
              className="w-28 shrink-0"
            />
            <SearchInput
              value={referenceSearch}
              onChange={(v) => { setReferenceSearch(v); setPage(1); }}
              placeholder="Ref (PS-3023)..."
              className="w-40 shrink-0"
            />
          </div>

          {/* Filters — mobile sheet */}
          <div className="md:hidden flex items-center gap-2 border-b border-qod-border px-4 py-2">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search test cases..."
              className="min-w-0 flex-1"
            />
            <FilterSheet
              activeCount={
                (suiteFilter ? 1 : 0) +
                (testRailTypeFilter ? 1 : 0) +
                (referencesFilter ? 1 : 0) +
                (referenceSearch ? 1 : 0)
              }
              onReset={() => {
                setSuiteFilter('');
                setTestRailTypeFilter('');
                setReferencesFilter('');
                setReferenceSearch('');
                setPage(1);
              }}
            >
              <Select
                value={suiteFilter}
                onChange={(v) => { setSuiteFilter(v); setPage(1); }}
                options={suiteOptions}
                aria-label="Suite"
                className="w-full"
              />
              <Select
                value={testRailTypeFilter}
                onChange={(v) => { setTestRailTypeFilter(v); setPage(1); }}
                options={testRailTypeOptions}
                aria-label="TestRail type"
                className="w-full"
              />
              <Select
                value={referencesFilter}
                onChange={(v) => { setReferencesFilter(v); setPage(1); }}
                options={[
                  { value: '', label: 'All Refs' },
                  { value: 'true', label: 'Has Ref' },
                  { value: 'false', label: 'No Ref' },
                ]}
                aria-label="References"
                className="w-full"
              />
              <SearchInput
                value={referenceSearch}
                onChange={(v) => { setReferenceSearch(v); setPage(1); }}
                placeholder="Ref (PS-3023)..."
                className="w-full"
              />
            </FilterSheet>
          </div>

          {casesLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-qod-accent" />
            </div>
          ) : (
            <DataTable
              columns={testCaseColumns as any}
              data={(testCasesData?.items ?? []) as any}
              getRowKey={(row: any) => row.id}
              pagination={testCasesData ? {
                page: testCasesData.page,
                pageSize: testCasesData.pageSize,
                total: testCasesData.total,
                onPageChange: setPage,
              } : undefined}
              mobileCard={(row: any) => (
                <button
                  type="button"
                  className="block w-full px-4 py-3 text-left"
                  onClick={() => { setDrawerTestId(row.id); setDrawerTestTitle(row.title); }}
                >
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 text-sm font-medium text-qod-accent">
                      {row.title}
                    </span>
                    <Badge variant={automationBadgeVariant(row.automationStatus)}>
                      {row.automationStatus.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                    {row.externalId && <span className="font-mono">C{row.externalId}</span>}
                    {row.suiteName && <span>{row.suiteName}</span>}
                    {row.testRailType && <span>{row.testRailType}</span>}
                    <span>
                      Last run:{' '}
                      {row.lastExecutedAt
                        ? new Date(row.lastExecutedAt).toLocaleDateString()
                        : 'Never'}
                    </span>
                  </div>
                </button>
              )}
            />
          )}
        </Card>
      )}

      {/* Stories Tab */}
      {activeTab === 'stories' && (
        <Card className="p-0">
          <div className="border-b border-qod-border px-4 py-3">
            <h2 className="text-sm font-semibold text-primary">Stories</h2>
          </div>

          {/* Filters */}
          {/* Filters — desktop inline row */}
          <div className="hidden md:flex items-center gap-2 border-b border-qod-border px-4 py-2">
            <SearchInput
              value={storySearch}
              onChange={(v) => { setStorySearch(v); setStoryPage(1); }}
              placeholder="Search stories..."
              className="min-w-0 flex-1"
            />
            <Select
              value={storyStatusFilter}
              onChange={(v) => { setStoryStatusFilter(v); setStoryPage(1); }}
              options={[
                { value: '', label: 'All Statuses' },
                { value: 'OPEN', label: 'Open' },
                { value: 'IN_PROGRESS', label: 'In Progress' },
                { value: 'RESOLVED', label: 'Resolved' },
                { value: 'CLOSED', label: 'Closed' },
                { value: 'REOPENED', label: 'Reopened' },
              ]}
              className="w-36 shrink-0"
            />
            <Select
              value={storyComponentFilter}
              onChange={(v) => { setStoryComponentFilter(v); setStoryPage(1); }}
              options={storyComponentOptions}
              className="w-40 shrink-0"
            />
            <Select
              value={storyLabelFilter}
              onChange={(v) => { setStoryLabelFilter(v); setStoryPage(1); }}
              options={storyLabelOptions}
              className="w-36 shrink-0"
            />
          </div>

          {/* Filters — mobile sheet */}
          <div className="md:hidden flex items-center gap-2 border-b border-qod-border px-4 py-2">
            <SearchInput
              value={storySearch}
              onChange={(v) => { setStorySearch(v); setStoryPage(1); }}
              placeholder="Search stories..."
              className="min-w-0 flex-1"
            />
            <FilterSheet
              activeCount={
                (storyStatusFilter ? 1 : 0) +
                (storyComponentFilter ? 1 : 0) +
                (storyLabelFilter ? 1 : 0)
              }
              onReset={() => {
                setStoryStatusFilter('');
                setStoryComponentFilter('');
                setStoryLabelFilter('');
                setStoryPage(1);
              }}
            >
              <Select
                value={storyStatusFilter}
                onChange={(v) => { setStoryStatusFilter(v); setStoryPage(1); }}
                options={[
                  { value: '', label: 'All Statuses' },
                  { value: 'OPEN', label: 'Open' },
                  { value: 'IN_PROGRESS', label: 'In Progress' },
                  { value: 'RESOLVED', label: 'Resolved' },
                  { value: 'CLOSED', label: 'Closed' },
                  { value: 'REOPENED', label: 'Reopened' },
                ]}
                aria-label="Status"
                className="w-full"
              />
              <Select
                value={storyComponentFilter}
                onChange={(v) => { setStoryComponentFilter(v); setStoryPage(1); }}
                options={storyComponentOptions}
                aria-label="Component"
                className="w-full"
              />
              <Select
                value={storyLabelFilter}
                onChange={(v) => { setStoryLabelFilter(v); setStoryPage(1); }}
                options={storyLabelOptions}
                aria-label="Label"
                className="w-full"
              />
            </FilterSheet>
          </div>

          {storiesLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-qod-accent" />
            </div>
          ) : (
            <DataTable
              columns={storyColumns as any}
              data={(storiesData?.items ?? []) as any}
              getRowKey={(row: any) => row.id}
              pagination={storiesData ? {
                page: storiesData.page,
                pageSize: storiesData.pageSize,
                total: storiesData.total,
                onPageChange: setStoryPage,
              } : undefined}
              mobileCard={(row: any) => (
                <div className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 text-sm font-medium text-primary">
                      {row.url ? (
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-qod-accent hover:underline"
                        >
                          {row.title}
                        </a>
                      ) : (
                        row.title
                      )}
                    </span>
                    <Badge variant={storyStatusBadgeVariant(row.status)}>
                      {row.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                    <span className="font-mono">{row.externalId}</span>
                    {row.storyPoints != null && <span>{row.storyPoints} pts</span>}
                    {row.assignee && <span>{row.assignee}</span>}
                    {row.component && <span>{row.component}</span>}
                  </div>
                </div>
              )}
            />
          )}
        </Card>
      )}

      {/* Epics Tab */}
      {activeTab === 'epics' && (
        <Card className="p-0">
          <div className="border-b border-qod-border px-4 py-3">
            <h2 className="text-sm font-semibold text-primary">Epics</h2>
            <p className="text-xs text-muted mt-0.5">
              Click an epic to see stories, click a story to see linked test cases.
            </p>
          </div>

          {/* Epic Filters */}
          <div className="flex items-center gap-2 border-b border-qod-border px-4 py-2">
            <SearchInput
              value={epicSearch}
              onChange={setEpicSearch}
              placeholder="Search epics..."
              className="min-w-0 flex-1"
            />
            <Select
              value={epicStatusFilter}
              onChange={setEpicStatusFilter}
              options={epicStatusOptions}
              className="w-36 shrink-0"
            />
            <Select
              value={epicCoverageFilter}
              onChange={setEpicCoverageFilter}
              options={[
                { value: '', label: 'All Coverage' },
                { value: 'with_tcs', label: 'Has Test Cases' },
                { value: 'no_tcs', label: 'No Test Cases' },
              ]}
              className="w-40 shrink-0"
            />
            {epicCoverageData && (
              <span className="text-xs text-muted shrink-0">
                {sortedEpics.length} of {epicCoverageData.length} epics
              </span>
            )}
          </div>

          {epicCoverageLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-qod-accent" />
            </div>
          ) : sortedEpics.length > 0 ? (
            <div className="divide-y divide-qod-border">
              {sortedEpics.map((epic) => {
                const isExpanded = expandedEpic === epic.epicId;
                return (
                  <div key={epic.epicId}>
                    {/* Epic row */}
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-qod-surface/50 transition-colors"
                      onClick={() => { setExpandedEpic(isExpanded ? null : epic.epicId); setExpandedStory(null); }}
                    >
                      {isExpanded
                        ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" />
                        : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" />}
                      <span className="text-xs font-mono text-qod-accent min-w-[4.5rem]">
                        {epic.url ? (
                          <a href={epic.url} target="_blank" rel="noopener noreferrer" className="hover:underline" onClick={(e) => e.stopPropagation()}>
                            {epic.externalId}
                          </a>
                        ) : epic.externalId}
                      </span>
                      <span className="flex-1 truncate text-sm text-primary">{epic.title}</span>
                      <Badge variant={storyStatusBadgeVariant(epic.status)}>{epic.status}</Badge>
                      <span className="text-xs text-muted w-20 text-right">{epic.closedStories}/{epic.totalStories} stories</span>
                      <span className="text-xs w-24 text-right">
                        {epic.totalTCs > 0 ? (
                          <span className={epic.storiesCoveragePct >= 50 ? 'text-qod-success' : 'text-qod-warning'}>
                            {epic.storiesWithTCs}/{epic.totalStories} covered
                          </span>
                        ) : (
                          <span className="text-muted">no TCs</span>
                        )}
                      </span>
                      {epic.totalTCs > 0 ? (
                        <div className="flex items-center gap-1.5 w-28">
                          <div className="h-1.5 w-14 rounded-full bg-qod-surface overflow-hidden">
                            <div
                              className={`h-full rounded-full ${epic.automationPct >= 80 ? 'bg-qod-success' : epic.automationPct >= 50 ? 'bg-qod-warning' : 'bg-qod-error'}`}
                              style={{ width: `${Math.min(epic.automationPct, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted">{epic.automationPct}%</span>
                        </div>
                      ) : <span className="w-28" />}
                    </button>

                    {/* Expanded: Stories list */}
                    {isExpanded && (
                      <div className="bg-qod-surface/30">
                        {epic.stories.length === 0 ? (
                          <div className="px-10 py-3 text-xs text-muted">No stories in this epic.</div>
                        ) : (
                          <div className="divide-y divide-qod-border/50">
                            {epic.stories.map((story) => {
                              const isStoryExpanded = expandedStory === story.externalId;
                              return (
                                <div key={story.externalId}>
                                  {/* Story row */}
                                  <button
                                    type="button"
                                    className={`flex w-full items-center gap-3 pl-10 pr-4 py-2 text-left hover:bg-qod-surface/50 transition-colors ${story.totalTCs > 0 ? 'cursor-pointer' : 'cursor-default'}`}
                                    onClick={() => {
                                      if (story.totalTCs > 0) setExpandedStory(isStoryExpanded ? null : story.externalId);
                                    }}
                                  >
                                    {story.totalTCs > 0 ? (
                                      isStoryExpanded
                                        ? <ChevronDown className="h-3 w-3 shrink-0 text-muted" />
                                        : <ChevronRight className="h-3 w-3 shrink-0 text-muted" />
                                    ) : <span className="w-3 shrink-0" />}
                                    <span className="text-xs font-mono min-w-[4.5rem]">
                                      {story.url ? (
                                        <a href={story.url} target="_blank" rel="noopener noreferrer" className="text-qod-accent hover:underline" onClick={(e) => e.stopPropagation()}>
                                          {story.externalId}
                                        </a>
                                      ) : story.externalId}
                                    </span>
                                    <span className="flex-1 truncate text-xs text-primary">{story.title}</span>
                                    <Badge variant={storyStatusBadgeVariant(story.status)}>{story.status}</Badge>
                                    {story.totalTCs > 0 ? (
                                      <span className="text-xs text-muted w-32 text-right">
                                        {story.totalTCs} TCs ({story.automatedTCs} auto)
                                      </span>
                                    ) : (
                                      <span className="text-xs text-muted/50 w-32 text-right">no TCs</span>
                                    )}
                                  </button>

                                  {/* Expanded: Test Cases for this story */}
                                  {isStoryExpanded && story.testCases.length > 0 && (
                                    <div className="bg-qod-surface/50 pl-20 pr-4 py-1">
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="text-muted border-b border-qod-border/30">
                                            <th className="py-1 text-left font-medium">ID</th>
                                            <th className="py-1 text-left font-medium">Test Case</th>
                                            <th className="py-1 text-right font-medium">Automation</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-qod-border/20">
                                          {story.testCases.map((tc) => (
                                            <tr key={tc.id} className="hover:bg-qod-surface/30">
                                              <td className="py-1 font-mono text-muted">{tc.externalId ? `C${tc.externalId}` : '—'}</td>
                                              <td className="py-1">
                                                <button
                                                  type="button"
                                                  className="text-left text-qod-accent hover:underline"
                                                  onClick={() => { setDrawerTestId(tc.id); setDrawerTestTitle(tc.title); }}
                                                >
                                                  {tc.title}
                                                </button>
                                              </td>
                                              <td className="py-1 text-right">
                                                <Badge variant={automationBadgeVariant(tc.automationStatus)}>
                                                  {tc.automationStatus.replace(/_/g, ' ')}
                                                </Badge>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-muted">
              No epic data available. Sync a Jira Stories connector to populate epics.
            </div>
          )}
        </Card>
      )}

      {/* Test History Drawer */}
      <TestHistoryDrawer
        isOpen={!!drawerTestId}
        onClose={() => setDrawerTestId(null)}
        projectId={projectId}
        testCaseId={drawerTestId}
        testTitle={drawerTestTitle}
      />
    </div>
  );
}
