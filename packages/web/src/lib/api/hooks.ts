'use client';

// ─── TanStack Query hooks — API-first with demo fallback ──────────────
// Every hook tries the real backend first.  When the API is unreachable
// (no backend running, network error, etc.) it transparently falls back
// to the client-side demo data provider, so the app is always usable.
// Demo mode is controlled via the DemoModeProvider context (UI toggle).
// When demo mode is ON, hooks use client-side generated data.
// When demo mode is OFF, hooks use the API and show empty state on errors.

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { apiClient } from './client';
import { useDemoMode } from '@/app/_providers/demo-mode-provider';
import { getDemoAlertRules, type AlertRule } from '@/lib/demo/demo-alerts';
import {
  getDemoProjects,
  getDemoKPIDashboard,
  getDemoDataForProject,
  getDemoTestCases,
  getDemoTestRuns,
  getDemoDefects,
  getDemoStories,
  getDemoPipelineRuns,
  getDemoPassRateTrend,
  getDemoCoverageData,
  getDemoDefectTrend,
  getDemoFlakyTests,
  getDemoSeverityBreakdown,
  getRerunStats,
  getDefectMTTDMTTR,
  getTestExecutionHistory,
  type DemoProject,
  type KPICard,
  type TestCaseFilters,
  type TestRunFilters,
  type DefectFilters,
  type StoryFilters,
  type PaginatedResult,
  type DailyPassRate,
  type FeatureCoverage,
  type DailyDefectTrend,
  type FlakyTest,
  type SeverityBreakdown,
  type RerunStats,
  type DefectTimingStats,
  type TestExecutionEntry,
} from '@/lib/demo/demo-data-provider';
import type {
  DemoTestCase,
  DemoTestRun,
  DemoDefect,
  DemoPipelineRun,
  DemoStory,
  FormulaDefinition,
  FormulaParameters,
  FormulaPreviewResult,
  KPIMetricKey,
  ResolvedFormulaConfig,
} from '@qod/shared';
import {
  getDemoFormulaConfigs,
  previewDemoFormula,
} from '@/lib/demo/demo-data-provider';

const EMPTY_PAGINATED = { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };

// ── Projects ──────────────────────────────────────────────────────────

export function useProjects() {
  const { demoMode } = useDemoMode();
  return useQuery<DemoProject[]>({
    queryKey: ['projects', { demoMode }],
    queryFn: async () => {
      if (demoMode) return getDemoProjects();
      const projects = await apiClient<(DemoProject & { demoMode?: boolean })[]>('/api/v1/projects');
      return projects.filter((p) => !p.demoMode);
    },
    staleTime: 30_000,
  });
}

export function useProject(id: string) {
  const { demoMode } = useDemoMode();
  return useQuery<DemoProject | undefined>({
    queryKey: ['project', id, { demoMode }],
    queryFn: async () => {
      if (demoMode) return getDemoProjects().find((p) => p.id === id);
      return apiClient<DemoProject>(`/api/v1/projects/${id}`);
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}

// ── KPI Dashboard ─────────────────────────────────────────────────────

export function useKPIDashboard(projectId: string) {
  const { demoMode } = useDemoMode();
  return useQuery<KPICard[]>({
    queryKey: ['kpi-dashboard', projectId, { demoMode }],
    queryFn: async () => {
      if (demoMode) return getDemoKPIDashboard(projectId);
      return apiClient<KPICard[]>(`/api/v1/projects/${projectId}/kpis`);
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

// ── Test Case Filter Options ─────────────────────────────────────────

export interface TestCaseFilterOptions {
  suiteNames: string[];
  testRailTypes: string[];
}

export function useTestCaseFilterOptions(projectId: string) {
  const { demoMode } = useDemoMode();
  return useQuery<TestCaseFilterOptions>({
    queryKey: ['test-case-filter-options', projectId, { demoMode }],
    queryFn: async () => {
      if (demoMode) {
        const { testCases } = getDemoDataForProject(projectId);
        const suiteNames = [...new Set(testCases.map((tc) => tc.suiteName).filter(Boolean))].sort() as string[];
        const testRailTypes = [...new Set(testCases.map((tc) => tc.testRailType).filter(Boolean))].sort() as string[];
        return { suiteNames, testRailTypes };
      }
      return apiClient<TestCaseFilterOptions>(
        `/api/v1/projects/${projectId}/test-cases/filter-options`,
      );
    },
    enabled: !!projectId,
    staleTime: 60_000,
  });
}

// ── Test Cases ────────────────────────────────────────────────────────

export function useTestCases(projectId: string, filters?: TestCaseFilters) {
  const { demoMode } = useDemoMode();
  return useQuery<PaginatedResult<DemoTestCase>>({
    queryKey: ['test-cases', projectId, filters, { demoMode }],
    queryFn: async () => {
      if (demoMode) return getDemoTestCases(projectId, filters);
      const params = new URLSearchParams();
      if (filters?.featureAreaId) params.set('featureAreaId', filters.featureAreaId);
      if (filters?.type) params.set('type', filters.type);
      if (filters?.automationStatus) params.set('automationStatus', filters.automationStatus);
      if (filters?.suiteName) params.set('suiteName', filters.suiteName);
      if (filters?.testRailType) params.set('testRailType', filters.testRailType);
      if (filters?.hasReferences !== undefined) params.set('hasReferences', String(filters.hasReferences));
      if (filters?.referenceSearch) params.set('referenceSearch', filters.referenceSearch);
      if (filters?.search) params.set('search', filters.search);
      if (filters?.page) params.set('page', String(filters.page));
      if (filters?.pageSize) params.set('pageSize', String(filters.pageSize));
      const qs = params.toString();
      return apiClient<PaginatedResult<DemoTestCase>>(
        `/api/v1/projects/${projectId}/test-cases${qs ? `?${qs}` : ''}`,
      );
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

// ── Test Runs ─────────────────────────────────────────────────────────

export function useTestRuns(projectId: string, filters?: TestRunFilters) {
  const { demoMode } = useDemoMode();
  return useQuery<PaginatedResult<DemoTestRun>>({
    queryKey: ['test-runs', projectId, filters, { demoMode }],
    queryFn: async () => {
      if (demoMode) return getDemoTestRuns(projectId, filters);
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      if (filters?.branch) params.set('branch', filters.branch);
      if (filters?.environment) params.set('environment', filters.environment);
      if (filters?.search) params.set('search', filters.search);
      if (filters?.page) params.set('page', String(filters.page));
      if (filters?.pageSize) params.set('pageSize', String(filters.pageSize));
      const qs = params.toString();
      return apiClient<PaginatedResult<DemoTestRun>>(
        `/api/v1/projects/${projectId}/test-runs${qs ? `?${qs}` : ''}`,
      );
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

// ── Test Run Results (lazy-loaded on expand) ─────────────────────────

export interface TestRunResult {
  id: string;
  status: string;
  durationMs: number;
  errorMessage: string | null;
  testCaseId: string;
  testTitle: string;
}

export function useTestRunResults(projectId: string, runId: string | null) {
  const { demoMode } = useDemoMode();
  return useQuery<PaginatedResult<TestRunResult>>({
    queryKey: ['test-run-results', projectId, runId, { demoMode }],
    queryFn: async () => {
      if (!runId) return EMPTY_PAGINATED as PaginatedResult<TestRunResult>;
      if (demoMode) {
        const { testRuns, testCases } = getDemoDataForProject(projectId);
        const run = testRuns.find((r) => r.id === runId);
        if (!run) return EMPTY_PAGINATED as PaginatedResult<TestRunResult>;
        const testCaseMap = new Map(testCases.map((tc) => [tc.id, tc]));
        const items: TestRunResult[] = run.results.map((r) => ({
          id: r.id,
          status: r.status,
          durationMs: r.durationMs,
          errorMessage: r.errorMessage ?? null,
          testCaseId: r.testCaseId,
          testTitle: testCaseMap.get(r.testCaseId)?.title ?? r.testCaseId,
        }));
        return { items, total: items.length, page: 1, pageSize: items.length, totalPages: 1 };
      }
      return apiClient<PaginatedResult<TestRunResult>>(
        `/api/v1/projects/${projectId}/test-runs/${runId}/results?pageSize=100`,
      );
    },
    enabled: !!projectId && !!runId,
    staleTime: 60_000,
  });
}

// ── Defects ───────────────────────────────────────────────────────────

export function useDefects(projectId: string, filters?: DefectFilters) {
  const { demoMode } = useDemoMode();
  return useQuery<PaginatedResult<DemoDefect>>({
    queryKey: ['defects', projectId, filters, { demoMode }],
    queryFn: async () => {
      if (demoMode) return getDemoDefects(projectId, filters);
      const params = new URLSearchParams();
      if (filters?.severity) params.set('severity', filters.severity);
      if (filters?.status) params.set('status', filters.status);
      if (filters?.featureAreaId) params.set('featureAreaId', filters.featureAreaId);
      if (filters?.label) params.set('label', filters.label);
      if (filters?.search) params.set('search', filters.search);
      if (filters?.page) params.set('page', String(filters.page));
      if (filters?.pageSize) params.set('pageSize', String(filters.pageSize));
      const qs = params.toString();
      return apiClient<PaginatedResult<DemoDefect>>(
        `/api/v1/projects/${projectId}/defects${qs ? `?${qs}` : ''}`,
      );
    },
    enabled: !!projectId,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

// ── Defect Filter Options ─────────────────────────────────────────────

export interface DefectFilterOptions {
  labels: string[];
  components?: string[];
  totalCount?: number;
  openCount?: number;
  escapedCount?: number;
  critHighCount?: number;
  ageBuckets?: number[];
}

export function useDefectFilterOptions(projectId: string) {
  const { demoMode } = useDemoMode();
  return useQuery<DefectFilterOptions>({
    queryKey: ['defect-filter-options', projectId, { demoMode }],
    queryFn: async () => {
      if (demoMode) {
        const data = getDemoDataForProject(projectId);
        const defects = data.defects || [];
        const labels = [...new Set(defects.flatMap((d) => d.labels))].sort();
        const components = [...new Set(defects.map((d) => d.component).filter(Boolean))].sort();
        const OPEN = new Set(['OPEN', 'IN_PROGRESS', 'REOPENED']);
        const openDefects = defects.filter((d) => OPEN.has(d.status));
        const buckets = [0, 0, 0, 0, 0, 0, 0, 0, 0];
        const now = Date.now();
        for (const d of openDefects) {
          const days = (now - new Date(d.createdAt).getTime()) / 86_400_000;
          if (days < 1) buckets[0]++;
          else if (days < 3) buckets[1]++;
          else if (days < 7) buckets[2]++;
          else if (days < 14) buckets[3]++;
          else if (days < 28) buckets[4]++;
          else if (days < 90) buckets[5]++;
          else if (days < 180) buckets[6]++;
          else if (days < 365) buckets[7]++;
          else buckets[8]++;
        }
        return {
          labels,
          components,
          totalCount: defects.length,
          openCount: openDefects.length,
          escapedCount: defects.filter((d) => d.isEscaped).length,
          critHighCount: openDefects.filter(
            (d) => d.severity === 'CRITICAL' || d.severity === 'HIGH',
          ).length,
          ageBuckets: buckets,
        };
      }
      return apiClient<DefectFilterOptions>(
        `/api/v1/projects/${projectId}/defects/filter-options`,
      );
    },
    enabled: !!projectId,
    staleTime: 60_000,
  });
}

// ── Story Filter Options ──────────────────────────────────────────────

export interface StoryFilterOptions {
  components: string[];
  labels: string[];
}

export function useStoryFilterOptions(projectId: string) {
  const { demoMode } = useDemoMode();
  return useQuery<StoryFilterOptions>({
    queryKey: ['story-filter-options', projectId, { demoMode }],
    queryFn: async () => {
      if (demoMode) {
        const data = getDemoDataForProject(projectId);
        const components = [...new Set((data.stories || []).map((s) => s.component).filter(Boolean))].sort() as string[];
        const labels = [...new Set((data.stories || []).flatMap((s) => s.labels))].sort();
        return { components, labels };
      }
      return apiClient<StoryFilterOptions>(
        `/api/v1/projects/${projectId}/stories/filter-options`,
      );
    },
    enabled: !!projectId,
    staleTime: 60_000,
  });
}

// ── Stories ───────────────────────────────────────────────────────────

export function useStories(projectId: string, filters?: StoryFilters) {
  const { demoMode } = useDemoMode();
  return useQuery<PaginatedResult<DemoStory>>({
    queryKey: ['stories', projectId, filters, { demoMode }],
    queryFn: async () => {
      if (demoMode) return getDemoStories(projectId, filters);
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      if (filters?.component) params.set('component', filters.component);
      if (filters?.label) params.set('label', filters.label);
      if (filters?.search) params.set('search', filters.search);
      if (filters?.page) params.set('page', String(filters.page));
      if (filters?.pageSize) params.set('pageSize', String(filters.pageSize));
      const qs = params.toString();
      return apiClient<PaginatedResult<DemoStory>>(
        `/api/v1/projects/${projectId}/stories${qs ? `?${qs}` : ''}`,
      );
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

// ── Pipeline Runs ─────────────────────────────────────────────────────

export function usePipelineRuns(projectId: string) {
  const { demoMode } = useDemoMode();
  return useQuery<DemoPipelineRun[]>({
    queryKey: ['pipeline-runs', projectId, { demoMode }],
    queryFn: async () => {
      if (demoMode) return getDemoPipelineRuns(projectId);
      return apiClient<DemoPipelineRun[]>(
        `/api/v1/projects/${projectId}/pipeline-runs`,
      );
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

// ── Epic Coverage ────────────────────────────────────────────────────

export interface EpicStoryTestCase {
  id: string;
  externalId: string | null;
  title: string;
  automationStatus: string;
}

export interface EpicStory {
  externalId: string;
  title: string;
  url?: string;
  status: string;
  storyPoints?: number;
  totalTCs: number;
  automatedTCs: number;
  testCases: EpicStoryTestCase[];
}

export interface EpicCoverage {
  epicId: string;
  externalId: string;
  title: string;
  url?: string;
  status: string;
  totalStories: number;
  closedStories: number;
  totalPoints: number;
  storiesWithTCs: number;
  storiesCoveragePct: number;
  totalTCs: number;
  automatedTCs: number;
  automationPct: number;
  stories: EpicStory[];
}

export function useEpicCoverage(projectId: string) {
  const { demoMode } = useDemoMode();
  return useQuery<EpicCoverage[]>({
    queryKey: ['epic-coverage', projectId, { demoMode }],
    queryFn: async () => {
      if (demoMode) {
        const { stories, testCases, featureAreas } = getDemoDataForProject(projectId);

        // Build map: story externalId -> test cases linked via references
        const tcByStory = new Map<string, { total: number; automated: number }>();
        const tcDetailsByStory = new Map<string, EpicStoryTestCase[]>();
        for (const tc of testCases) {
          const matches = (tc.references || '').match(/[A-Z]+-\d+/g);
          if (!matches) continue;
          for (const ref of matches) {
            const entry = tcByStory.get(ref) || { total: 0, automated: 0 };
            entry.total++;
            if (tc.automationStatus === 'AUTOMATED') entry.automated++;
            tcByStory.set(ref, entry);

            const details = tcDetailsByStory.get(ref) || [];
            details.push({
              id: tc.id,
              externalId: tc.externalId,
              title: tc.title,
              automationStatus: tc.automationStatus,
            });
            tcDetailsByStory.set(ref, details);
          }
        }

        // Group stories by component (feature area) to create synthetic epics
        const storyByComponent = new Map<string, typeof stories>();
        for (const story of stories) {
          const list = storyByComponent.get(story.component) ?? [];
          list.push(story);
          storyByComponent.set(story.component, list);
        }

        const epics: EpicCoverage[] = [];
        let epicIdx = 0;
        for (const [component, componentStories] of storyByComponent) {
          const totalStories = componentStories.length;
          const totalPoints = componentStories.reduce((s, st) => s + (st.storyPoints ?? 0), 0);
          let storiesWithTCs = 0;
          let totalTCs = 0;
          let automatedTCs = 0;

          const epicStories: EpicStory[] = componentStories.map((story) => {
            const tc = tcByStory.get(story.externalId);
            const tcDetails = tcDetailsByStory.get(story.externalId) || [];
            if (tc) {
              storiesWithTCs++;
              totalTCs += tc.total;
              automatedTCs += tc.automated;
            }
            return {
              externalId: story.externalId,
              title: story.title,
              url: story.url,
              status: story.status,
              storyPoints: story.storyPoints ?? undefined,
              totalTCs: tc?.total ?? 0,
              automatedTCs: tc?.automated ?? 0,
              testCases: tcDetails,
            };
          });

          const closedStories = componentStories.filter(
            (s) => s.status === 'CLOSED' || s.status === 'RESOLVED',
          ).length;

          epics.push({
            epicId: `demo-epic-${epicIdx}`,
            externalId: `EPIC-${1000 + epicIdx}`,
            title: `${component} Epic`,
            url: `https://jira.example.com/browse/EPIC-${1000 + epicIdx}`,
            status: closedStories === totalStories ? 'CLOSED' : 'IN_PROGRESS',
            totalStories,
            closedStories,
            totalPoints,
            storiesWithTCs,
            storiesCoveragePct: totalStories > 0
              ? Math.round((storiesWithTCs / totalStories) * 1000) / 10
              : 0,
            totalTCs,
            automatedTCs,
            automationPct: totalTCs > 0
              ? Math.round((automatedTCs / totalTCs) * 1000) / 10
              : 0,
            stories: epicStories,
          });
          epicIdx++;
        }
        return epics;
      }
      return apiClient<EpicCoverage[]>(
        `/api/v1/projects/${projectId}/analytics/epic-coverage`,
      );
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

// ── Pass Rate Trend ───────────────────────────────────────────────────

export function usePassRateTrend(projectId: string, days: number = 30) {
  const { demoMode } = useDemoMode();
  return useQuery<DailyPassRate[]>({
    queryKey: ['pass-rate-trend', projectId, days, { demoMode }],
    queryFn: async () => {
      if (demoMode) return getDemoPassRateTrend(projectId, days);
      return apiClient<DailyPassRate[]>(
        `/api/v1/projects/${projectId}/analytics/pass-rate-trend?days=${days}`,
      );
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

// ── Coverage Data ─────────────────────────────────────────────────────

export function useCoverageData(projectId: string) {
  const { demoMode } = useDemoMode();
  return useQuery<FeatureCoverage[]>({
    queryKey: ['coverage-data', projectId, { demoMode }],
    queryFn: async () => {
      if (demoMode) return getDemoCoverageData(projectId);
      return apiClient<FeatureCoverage[]>(
        `/api/v1/projects/${projectId}/analytics/coverage`,
      );
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

// ── Defect Trend ──────────────────────────────────────────────────────

export function useDefectTrend(projectId: string) {
  const { demoMode } = useDemoMode();
  return useQuery<DailyDefectTrend[]>({
    queryKey: ['defect-trend', projectId, { demoMode }],
    queryFn: async () => {
      if (demoMode) return getDemoDefectTrend(projectId);
      return apiClient<DailyDefectTrend[]>(
        `/api/v1/projects/${projectId}/analytics/defect-trend`,
      );
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

// ── Flaky Tests ───────────────────────────────────────────────────────

export function useFlakyTests(projectId: string) {
  const { demoMode } = useDemoMode();
  return useQuery<FlakyTest[]>({
    queryKey: ['flaky-tests', projectId, { demoMode }],
    queryFn: async () => {
      if (demoMode) return getDemoFlakyTests(projectId);
      return apiClient<FlakyTest[]>(
        `/api/v1/projects/${projectId}/analytics/flaky-tests`,
      );
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

// ── Severity Breakdown ────────────────────────────────────────────────

export function useSeverityBreakdown(projectId: string) {
  const { demoMode } = useDemoMode();
  return useQuery<SeverityBreakdown[]>({
    queryKey: ['severity-breakdown', projectId, { demoMode }],
    queryFn: async () => {
      if (demoMode) return getDemoSeverityBreakdown(projectId);
      return apiClient<SeverityBreakdown[]>(
        `/api/v1/projects/${projectId}/analytics/severity-breakdown`,
      );
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

// ── Re-run Stats ─────────────────────────────────────────────────────

export function useRerunStats(projectId: string) {
  const { demoMode } = useDemoMode();
  return useQuery<RerunStats>({
    queryKey: ['rerun-stats', projectId, { demoMode }],
    queryFn: async () => {
      if (demoMode) return getRerunStats(projectId);
      return apiClient<RerunStats>(
        `/api/v1/projects/${projectId}/analytics/rerun-stats`,
      );
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

// ── Defect MTTD / MTTR ──────────────────────────────────────────────

export function useDefectTimingStats(projectId: string) {
  const { demoMode } = useDemoMode();
  return useQuery<DefectTimingStats>({
    queryKey: ['defect-timing-stats', projectId, { demoMode }],
    queryFn: async () => {
      if (demoMode) return getDefectMTTDMTTR(projectId);
      return apiClient<DefectTimingStats>(
        `/api/v1/projects/${projectId}/analytics/defect-timing`,
      );
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

// ── Test Execution History ───────────────────────────────────────────

export function useTestExecutionHistory(projectId: string, testCaseId: string | null) {
  const { demoMode } = useDemoMode();
  return useQuery<TestExecutionEntry[]>({
    queryKey: ['test-execution-history', projectId, testCaseId, { demoMode }],
    queryFn: async () => {
      if (!testCaseId) return [];
      if (demoMode) return getTestExecutionHistory(projectId, testCaseId);
      return apiClient<TestExecutionEntry[]>(
        `/api/v1/projects/${projectId}/test-cases/${testCaseId}/history`,
      );
    },
    enabled: !!projectId && !!testCaseId,
    staleTime: 30_000,
  });
}

// ─── User Management ──────────────────────────────────────────────

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient<any[]>('/api/v1/users'),
    staleTime: 30_000,
  });
}

export function useUserProjects(userId: string) {
  return useQuery({
    queryKey: ['users', userId, 'projects'],
    queryFn: () => apiClient<any[]>(`/api/v1/users/${userId}/projects`),
    enabled: !!userId,
    staleTime: 30_000,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { email: string; username: string; name: string; role?: string; password?: string }) =>
      apiClient<any>('/api/v1/users', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; username?: string; email?: string; role?: string }) =>
      apiClient<any>(`/api/v1/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<any>(`/api/v1/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useBlockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<any>(`/api/v1/users/${id}/block`, { method: 'POST', body: '{}' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUnblockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<any>(`/api/v1/users/${id}/unblock`, { method: 'POST', body: '{}' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useRegeneratePassword() {
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ password: string }>(`/api/v1/users/${id}/regenerate-password`, { method: 'POST', body: '{}' }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      apiClient<{ message: string }>('/api/v1/users/me/change-password', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  });
}

export function useSetUserProjectAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, projectId, role }: { userId: string; projectId: string; role: string }) =>
      apiClient<any>(`/api/v1/users/${userId}/projects/${projectId}`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useRemoveUserProjectAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, projectId }: { userId: string; projectId: string }) =>
      apiClient<any>(`/api/v1/users/${userId}/projects/${projectId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

// ─── Alert Rules ─────────────────────────────────────────────────────

export function useAlertRules(projectId: string) {
  const { demoMode } = useDemoMode();
  return useQuery<AlertRule[]>({
    queryKey: ['alert-rules', projectId, { demoMode }],
    queryFn: async () => {
      if (demoMode) return getDemoAlertRules(projectId);
      return apiClient<AlertRule[]>(`/api/v1/projects/${projectId}/alerts`);
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export function useCreateAlertRule(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { metric: string; condition: string; threshold: number; channel: string; channelConfig?: Record<string, any> }) =>
      apiClient<AlertRule>(`/api/v1/projects/${projectId}/alerts`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alert-rules', projectId] }),
  });
}

export function useUpdateAlertRule(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; metric?: string; condition?: string; threshold?: number; channel?: string; channelConfig?: Record<string, any>; enabled?: boolean }) =>
      apiClient<AlertRule>(`/api/v1/projects/${projectId}/alerts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alert-rules', projectId] }),
  });
}

export function useDeleteAlertRule(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<any>(`/api/v1/projects/${projectId}/alerts/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alert-rules', projectId] }),
  });
}

// ─── Notifications ───────────────────────────────────────────────────

export interface Notification {
  id: string;
  userId: string;
  projectId?: string | null;
  alertRuleId?: string | null;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  muted: boolean;
  createdAt: string;
  project?: { id: string; name: string } | null;
  alertRule?: { id: string; metric: string; condition: string; threshold: number; enabled: boolean } | null;
}

export interface NotificationLogPage {
  items: Notification[];
  total: number;
  page: number;
  pageSize: number;
}

function getDemoNotifications(): Notification[] {
  return [
    {
      id: 'demo-notif-1',
      userId: 'demo-user',
      title: 'Alert: COVERAGE_PCT threshold breached',
      body: 'COVERAGE_PCT is 72.5, which breaches the LESS_THAN 80 threshold.',
      link: null,
      read: false,
      muted: false,
      createdAt: new Date(Date.now() - 1800000).toISOString(),
    },
    {
      id: 'demo-notif-2',
      userId: 'demo-user',
      title: 'Alert: FLAKY_RATE threshold breached',
      body: 'FLAKY_RATE is 12.3, which breaches the GREATER_THAN 10 threshold.',
      link: null,
      read: false,
      muted: false,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'demo-notif-3',
      userId: 'demo-user',
      title: 'Alert: PASS_RATE_7D threshold breached',
      body: 'PASS_RATE_7D is 85.2, which breaches the LESS_THAN 90 threshold.',
      link: null,
      read: true,
      muted: false,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
  ];
}

export function useNotifications() {
  const { demoMode } = useDemoMode();
  return useQuery<Notification[]>({
    queryKey: ['notifications', { demoMode }],
    queryFn: async () => {
      if (demoMode) return getDemoNotifications();
      return apiClient<Notification[]>('/api/v1/notifications');
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useUnreadNotificationCount() {
  const { demoMode } = useDemoMode();
  return useQuery<{ count: number }>({
    queryKey: ['notification-unread-count', { demoMode }],
    queryFn: async () => {
      if (demoMode) return { count: getDemoNotifications().filter(n => !n.read).length };
      return apiClient<{ count: number }>('/api/v1/notifications/unread-count');
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<any>(`/api/v1/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notification-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notification-log'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<any>('/api/v1/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notification-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notification-log'] });
    },
  });
}

interface NotificationLogFilters {
  page: number;
  pageSize: number;
  search: string;
  projectId?: string;
  metrics?: string[];
}

export function useNotificationLog(filters: NotificationLogFilters) {
  const { demoMode } = useDemoMode();
  return useQuery<NotificationLogPage>({
    queryKey: ['notification-log', filters, { demoMode }],
    queryFn: async () => {
      if (demoMode) {
        const all = getDemoNotifications();
        return { items: all, total: all.length, page: 1, pageSize: all.length };
      }
      const params = new URLSearchParams();
      params.set('page', String(filters.page));
      params.set('pageSize', String(filters.pageSize));
      if (filters.search) params.set('search', filters.search);
      if (filters.projectId) params.set('projectId', filters.projectId);
      if (filters.metrics && filters.metrics.length > 0) {
        params.set('metrics', filters.metrics.join(','));
      }
      return apiClient<NotificationLogPage>(`/api/v1/notifications/log?${params.toString()}`);
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useMuteAlertFromNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<any>(`/api/v1/notifications/${id}/mute`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-log'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notification-unread-count'] });
    },
  });
}

export function useUnmuteAlertFromNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<any>(`/api/v1/notifications/${id}/unmute`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-log'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notification-unread-count'] });
    },
  });
}

// ── KPI Formula Configurator ────────────────────────────────────────

export interface KPIFormulaListResponse {
  definitions: FormulaDefinition[];
  configs: ResolvedFormulaConfig[];
}

export function useKPIFormulas(projectId: string) {
  const { demoMode } = useDemoMode();
  return useQuery<KPIFormulaListResponse>({
    queryKey: ['kpi-formulas', projectId, { demoMode }],
    queryFn: async () => {
      if (demoMode) return getDemoFormulaConfigs();
      return apiClient<KPIFormulaListResponse>(
        `/api/v1/projects/${projectId}/kpis/formulas`,
      );
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export function useUpsertKPIFormula(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      metric,
      parameters,
      expression,
    }: {
      metric: KPIMetricKey;
      parameters: FormulaParameters;
      expression: string | null;
    }) => {
      return apiClient<ResolvedFormulaConfig>(
        `/api/v1/projects/${projectId}/kpis/formulas/${metric}`,
        {
          method: 'PUT',
          body: JSON.stringify({ parameters, expression }),
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpi-formulas', projectId] });
      queryClient.invalidateQueries({ queryKey: ['kpi-dashboard', projectId] });
    },
  });
}

export function useResetKPIFormula(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (metric: KPIMetricKey) => {
      return apiClient<ResolvedFormulaConfig>(
        `/api/v1/projects/${projectId}/kpis/formulas/${metric}/reset`,
        { method: 'POST' },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpi-formulas', projectId] });
      queryClient.invalidateQueries({ queryKey: ['kpi-dashboard', projectId] });
    },
  });
}

export function usePreviewKPIFormula(projectId: string) {
  const { demoMode } = useDemoMode();
  return useMutation({
    mutationFn: async ({
      metric,
      parameters,
      expression,
    }: {
      metric: KPIMetricKey;
      parameters: FormulaParameters;
      expression: string | null;
    }): Promise<FormulaPreviewResult> => {
      if (demoMode) {
        return previewDemoFormula(projectId, metric, parameters, expression);
      }
      return apiClient<FormulaPreviewResult>(
        `/api/v1/projects/${projectId}/kpis/formulas/${metric}/preview`,
        {
          method: 'POST',
          body: JSON.stringify({ parameters, expression }),
        },
      );
    },
  });
}
