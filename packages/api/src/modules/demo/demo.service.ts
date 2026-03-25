import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  generateDemoData,
  DemoDataSet,
  DemoConfig,
  DEFAULT_DEMO_CONFIG,
} from '@qod/shared';

const MAX_CACHE_SIZE = 100;

@Injectable()
export class DemoService {
  private cache = new Map<string, DemoDataSet>();

  constructor(private readonly prisma: PrismaService) {}

  private hashSeed(projectId: string): number {
    let hash = 0;
    for (let i = 0; i < projectId.length; i++) {
      hash = (hash * 31 + projectId.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  private getDataSet(projectId: string): DemoDataSet {
    if (!this.cache.has(projectId)) {
      // Evict oldest entry if cache is full
      if (this.cache.size >= MAX_CACHE_SIZE) {
        const oldestKey = this.cache.keys().next().value!;
        this.cache.delete(oldestKey);
      }
      const seed = this.hashSeed(projectId);
      const config: DemoConfig = { ...DEFAULT_DEMO_CONFIG, seed };
      this.cache.set(projectId, generateDemoData(config));
    }
    return this.cache.get(projectId)!;
  }

  async isDemoMode(projectId: string): Promise<boolean> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { connectorConfigs: true },
    });

    if (!project) return false;

    if (project.demoMode) return true;

    return project.connectorConfigs.length === 0;
  }

  async getDemoOverview(projectId: string) {
    const ds = this.getDataSet(projectId);
    const recentRuns = ds.testRuns.slice(-10);
    const openDefects = ds.defects.filter(
      (d) => d.status === 'OPEN' || d.status === 'IN_PROGRESS',
    );
    const latestKpis = new Map<string, (typeof ds.kpiSnapshots)[0]>();
    for (const snap of ds.kpiSnapshots) {
      const existing = latestKpis.get(snap.metric);
      if (!existing || snap.recordedAt > existing.recordedAt) {
        latestKpis.set(snap.metric, snap);
      }
    }

    return {
      totalTestCases: ds.testCases.length,
      totalTestRuns: ds.testRuns.length,
      totalDefects: ds.defects.length,
      openDefects: openDefects.length,
      recentRunsCount: recentRuns.length,
      kpiSummary: Object.fromEntries(
        Array.from(latestKpis.entries()).map(([metric, snap]) => [
          metric,
          { value: snap.value, target: snap.target },
        ]),
      ),
    };
  }

  async getDemoTestCases(
    projectId: string,
    filters?: { page?: number; limit?: number; featureAreaId?: string; type?: string },
  ) {
    const ds = this.getDataSet(projectId);
    let items = ds.testCases;

    if (filters?.featureAreaId) {
      items = items.filter((tc) => tc.featureAreaId === filters.featureAreaId);
    }
    if (filters?.type) {
      items = items.filter((tc) => tc.type === filters.type);
    }

    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const start = (page - 1) * limit;
    const data = items.slice(start, start + limit);

    return { data, total: items.length, page, limit };
  }

  async getDemoTestRuns(
    projectId: string,
    filters?: { page?: number; limit?: number; status?: string; branch?: string },
  ) {
    const ds = this.getDataSet(projectId);
    let items = ds.testRuns;

    if (filters?.status) {
      items = items.filter((tr) => tr.status === filters.status);
    }
    if (filters?.branch) {
      items = items.filter((tr) => tr.branch === filters.branch);
    }

    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const start = (page - 1) * limit;
    const data = items.slice(start, start + limit);

    return { data, total: items.length, page, limit };
  }

  async getDemoDefects(
    projectId: string,
    filters?: { page?: number; limit?: number; severity?: string; status?: string },
  ) {
    const ds = this.getDataSet(projectId);
    let items = ds.defects;

    if (filters?.severity) {
      items = items.filter((d) => d.severity === filters.severity);
    }
    if (filters?.status) {
      items = items.filter((d) => d.status === filters.status);
    }

    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const start = (page - 1) * limit;
    const data = items.slice(start, start + limit);

    return { data, total: items.length, page, limit };
  }

  async getDemoKPISnapshots(
    projectId: string,
    metric?: string,
    days?: number,
  ) {
    const ds = this.getDataSet(projectId);
    let items = ds.kpiSnapshots;

    if (metric) {
      items = items.filter((s) => s.metric === metric);
    }
    if (days) {
      const cutoff = new Date(Date.now() - days * 86400000);
      items = items.filter((s) => s.recordedAt >= cutoff);
    }

    return items;
  }

  async getDemoPipelineRuns(projectId: string) {
    const ds = this.getDataSet(projectId);
    return ds.pipelineRuns;
  }

  async getFeatureAreas(projectId: string) {
    const ds = this.getDataSet(projectId);
    return ds.featureAreas;
  }
}
