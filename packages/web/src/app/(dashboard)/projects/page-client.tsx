'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FolderKanban,
  Plus,
  TestTube2,
  Bug,
  TrendingUp,
  Clock,
  X,
} from 'lucide-react';
import { useProjects } from '@/lib/api/hooks';
import { useDemoMode } from '@/app/_providers/demo-mode-provider';
import { getDemoDataForProject, getDemoKPIDashboard } from '@/lib/demo/demo-data-provider';
import { apiClient } from '@/lib/api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils/cn';
import { formatRelativeTime } from '@/lib/utils/format';

function passRateColor(rate: number): string {
  if (rate >= 90) return 'text-rag-green';
  if (rate >= 75) return 'text-rag-amber';
  return 'text-rag-red';
}

export default function ProjectsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { demoMode } = useDemoMode();
  const { data: projects = [], isLoading } = useProjects();

  const realProjectIds = useMemo(
    () => (demoMode ? [] : projects.filter((p) => !p.demoMode).map((p) => p.id)),
    [demoMode, projects],
  );

  const { data: summaries = {} } = useQuery<Record<string, { testCount: number; passRate: number; openDefects: number; lastRunAt: string | null }>>({
    queryKey: ['project-summaries', realProjectIds],
    queryFn: async () => {
      const results = await Promise.all(
        realProjectIds.map((id) =>
          apiClient<{ testCount: number; passRate: number; openDefects: number; lastRunAt: string | null }>(
            `/api/v1/projects/${id}/summary`,
          ).then((s) => [id, s] as const).catch(() => [id, null] as const),
        ),
      );
      const map: Record<string, { testCount: number; passRate: number; openDefects: number; lastRunAt: string | null }> = {};
      for (const [id, s] of results) {
        if (s) map[id] = s;
      }
      return map;
    },
    enabled: realProjectIds.length > 0,
    staleTime: 30_000,
  });

  const enrichedProjects = useMemo(() => {
    return projects.map((p) => {
      if (p.demoMode || demoMode) {
        const data = getDemoDataForProject(p.id);
        const kpis = getDemoKPIDashboard(p.id);
        const passRate = kpis.find((k) => k.metric === 'PASS_RATE_7D')?.latestValue ?? 0;
        const openDefects = data.defects.filter((d) => ['OPEN', 'IN_PROGRESS', 'REOPENED'].includes(d.status)).length;
        return {
          ...p,
          testCount: data.testCases.length,
          passRate,
          openDefects,
          lastRunAt: data.testRuns[data.testRuns.length - 1]?.startedAt as Date | undefined,
        };
      }
      const s = summaries[p.id];
      return {
        ...p,
        testCount: s?.testCount ?? 0,
        passRate: s?.passRate ?? 0,
        openDefects: s?.openDefects ?? 0,
        lastRunAt: s?.lastRunAt ? new Date(s.lastRunAt) : undefined,
      };
    });
  }, [projects, demoMode, summaries]);

  const [showNewProject, setShowNewProject] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  async function handleCreate() {
    if (!newName.trim() || creating) return;
    setCreating(true);
    setCreateError('');
    try {
      const project = await apiClient<{ id: string }>('/api/v1/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim(),
          description: newDesc.trim() || undefined,
        }),
      });
      setShowNewProject(false);
      setNewName('');
      setNewDesc('');
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      router.push(`/projects/${project.id}/settings`);
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('already exists') || msg.includes('409') || msg.includes('Conflict')) {
        setCreateError(`A project named "${newName.trim()}" already exists.`);
      } else {
        setCreateError('Failed to create project. Please try again.');
      }
    } finally {
      setCreating(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-qod-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-primary">Projects</h1>
          <p className="mt-1 text-sm text-muted">
            {projects.length} projects configured
          </p>
        </div>
        <button
          onClick={() => setShowNewProject(true)}
          className="flex items-center gap-2 rounded-lg bg-qod-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-qod-accent/90"
        >
          <Plus className="h-4 w-4" />
          New Project
        </button>
      </div>

      {/* New Project Dialog */}
      {showNewProject && (
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-primary">Create New Project</h2>
            <button onClick={() => setShowNewProject(false)} className="text-muted hover:text-primary">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">Project Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Payment Service"
                className="w-full rounded-md border border-qod-border bg-qod-bg px-3 py-2 text-sm text-primary placeholder:text-muted focus:border-qod-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">Description (optional)</label>
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Brief description of the project..."
                rows={2}
                className="w-full rounded-md border border-qod-border bg-qod-bg px-3 py-2 text-sm text-primary placeholder:text-muted focus:border-qod-accent focus:outline-none"
              />
            </div>
            {createError && (
              <p role="alert" className="text-xs text-rag-red">{createError}</p>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                className="rounded-lg bg-qod-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-qod-accent/90 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Project'}
              </button>
              <button
                onClick={() => { setShowNewProject(false); setCreateError(''); }}
                className="rounded-lg border border-qod-border px-4 py-2 text-sm text-secondary hover:text-primary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Grid */}
      {projects.length === 0 ? (
        <div className="card p-12 text-center">
          <FolderKanban className="mx-auto h-10 w-10 text-muted" />
          <p className="mt-3 text-sm text-muted">No projects yet. Click &quot;New Project&quot; to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {enrichedProjects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="card group p-5 transition-colors hover:border-qod-accent/40"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-qod-bg">
                    <FolderKanban className="h-4 w-4 text-qod-accent" />
                  </div>
                  <h3 className="text-sm font-semibold text-primary group-hover:text-qod-accent transition-colors">
                    {project.name}
                  </h3>
                </div>
                {project.demoMode && (
                  <span className="rounded-full bg-rag-amber/10 px-2 py-0.5 text-[10px] font-medium text-rag-amber">
                    Demo
                  </span>
                )}
              </div>

              {/* Description */}
              {project.description && (
                <p className="mt-3 text-xs leading-relaxed text-muted line-clamp-2">
                  {project.description}
                </p>
              )}

              {/* Stats Row */}
              <div className="mt-4 flex items-center gap-4 border-t border-qod-border pt-3">
                <div className="flex items-center gap-1.5">
                  <TestTube2 className="h-3.5 w-3.5 text-muted" />
                  <span className="text-xs text-secondary">{project.testCount}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <TrendingUp className={cn('h-3.5 w-3.5', passRateColor(project.passRate))} />
                  <span className={cn('text-xs font-medium', passRateColor(project.passRate))}>
                    {project.passRate.toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Bug className="h-3.5 w-3.5 text-muted" />
                  <span className="text-xs text-secondary">{project.openDefects} open</span>
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  <Clock className="h-3 w-3 text-muted" />
                  <span className="text-[10px] text-muted">
                    {formatRelativeTime(project.lastRunAt)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
