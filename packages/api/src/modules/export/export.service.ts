import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

type ExportType = 'test-cases' | 'test-runs' | 'defects' | 'kpi-snapshots';

/**
 * Escapes a CSV field value according to RFC 4180:
 * - If the value contains a comma, double quote, or newline, wrap it in double quotes
 * - Double quotes within the value are escaped by doubling them
 */
function escapeCSV(value: unknown): string {
  if (value == null) return '';
  const str = typeof value === 'string' ? value : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCSV(headers: string[], rows: string[][]): string {
  const headerLine = headers.join(',');
  if (rows.length === 0) return headerLine;
  const dataLines = rows.map((row) => row.map(escapeCSV).join(','));
  return [headerLine, ...dataLines].join('\n');
}

@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── CSV Export ──────────────────────────────────────
  async exportCSV(projectId: string, type: string): Promise<string> {
    switch (type as ExportType) {
      case 'test-cases':
        return this.exportTestCasesCSV(projectId);
      case 'test-runs':
        return this.exportTestRunsCSV(projectId);
      case 'defects':
        return this.exportDefectsCSV(projectId);
      case 'kpi-snapshots':
        return this.exportKPISnapshotsCSV(projectId);
      default:
        throw new Error(`Unsupported export type: ${type}`);
    }
  }

  private async exportTestCasesCSV(projectId: string): Promise<string> {
    const headers = ['Title', 'Type', 'AutomationStatus', 'FeatureArea', 'Tags', 'LastExecuted'];

    const testCases = await this.prisma.testCase.findMany({
      where: { projectId, deletedAt: null },
      include: { featureArea: true },
    });

    const rows = testCases.map((tc: any) => [
      tc.title,
      tc.type,
      tc.automationStatus,
      tc.featureArea?.name ?? null,
      tc.tags?.length ? tc.tags.join(',') : null,
      tc.lastExecutedAt ? tc.lastExecutedAt.toISOString() : null,
    ]);

    return toCSV(headers, rows);
  }

  private async exportTestRunsCSV(projectId: string): Promise<string> {
    const headers = [
      'Name', 'Status', 'Branch', 'Environment', 'StartedAt',
      'Duration', 'Passed', 'Failed', 'Skipped',
    ];

    const testRuns = await this.prisma.testRun.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { startedAt: 'desc' },
    });

    const rows = testRuns.map((run: any) => [
      run.name,
      run.status,
      run.branch,
      run.environment,
      run.startedAt ? run.startedAt.toISOString() : null,
      run.durationMs,
      run.passedCount,
      run.failedCount,
      run.skippedCount,
    ]);

    return toCSV(headers, rows);
  }

  private async exportDefectsCSV(projectId: string): Promise<string> {
    const headers = [
      'ExternalId', 'Title', 'Severity', 'Priority', 'Status',
      'Component', 'CreatedAt', 'ResolvedAt',
    ];

    const defects = await this.prisma.defect.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    const rows = defects.map((d: any) => [
      d.externalId,
      d.title,
      d.severity,
      d.priority,
      d.status,
      d.component,
      d.createdAt ? d.createdAt.toISOString() : null,
      d.resolvedAt ? d.resolvedAt.toISOString() : null,
    ]);

    return toCSV(headers, rows);
  }

  private async exportKPISnapshotsCSV(projectId: string): Promise<string> {
    const headers = ['Metric', 'Value', 'Target', 'RecordedAt'];

    const snapshots = await this.prisma.kPISnapshot.findMany({
      where: { projectId },
      orderBy: { recordedAt: 'desc' },
    });

    const rows = snapshots.map((s: any) => [
      s.metric,
      s.value,
      s.target,
      s.recordedAt ? s.recordedAt.toISOString() : null,
    ]);

    return toCSV(headers, rows);
  }

  // ─── Project Summary JSON ────────────────────────────
  async exportProjectSummaryJSON(projectId: string) {
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
    });

    const [
      totalTestCases,
      totalDefectsOpen,
      passRateSnap,
      coverageSnap,
      flakyGroups,
      recentRuns,
    ] = await Promise.all([
      this.prisma.testCase.count({ where: { projectId, deletedAt: null } }),
      this.prisma.defect.count({
        where: { projectId, deletedAt: null, status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] } },
      }),
      this.prisma.kPISnapshot.findFirst({
        where: { projectId, metric: 'PASS_RATE_7D' as any },
        orderBy: { recordedAt: 'desc' },
      }),
      this.prisma.kPISnapshot.findFirst({
        where: { projectId, metric: 'COVERAGE_PCT' as any },
        orderBy: { recordedAt: 'desc' },
      }),
      this.prisma.testResult.groupBy({
        by: ['testCaseId'],
        where: { status: 'FLAKY' as any, testCase: { projectId } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
      this.prisma.testRun.findMany({
        where: { projectId, deletedAt: null },
        orderBy: { startedAt: 'desc' },
        take: 10,
      }),
    ]);

    // Resolve flaky test names
    const flakyTestCaseIds = flakyGroups.map((g: any) => g.testCaseId);
    const flakyTestCases =
      flakyTestCaseIds.length > 0
        ? await this.prisma.testCase.findMany({
            where: { id: { in: flakyTestCaseIds } },
          })
        : [];

    const flakyMap = new Map(flakyTestCases.map((tc: any) => [tc.id, tc.title]));

    const topFlakyTests = flakyGroups.map((g: any) => ({
      testCaseId: g.testCaseId,
      title: flakyMap.get(g.testCaseId) ?? 'Unknown',
      flakyCount: g._count.id,
    }));

    return {
      projectName: (project as any).name,
      totalTestCases,
      totalDefectsOpen,
      passRate7d: passRateSnap ? (passRateSnap as any).value : null,
      coveragePct: coverageSnap ? (coverageSnap as any).value : null,
      topFlakyTests,
      recentRuns,
    };
  }

  // ─── PDF Report (simple text-based) ──────────────────
  async generatePDFReport(projectId: string): Promise<Buffer> {
    const summary = await this.exportProjectSummaryJSON(projectId);

    const lines: string[] = [];
    lines.push('='.repeat(60));
    lines.push('Quality Observability Report');
    lines.push('='.repeat(60));
    lines.push('');
    lines.push(`Project: ${summary.projectName}`);
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('-'.repeat(60));
    lines.push('KPI Summary');
    lines.push('-'.repeat(60));
    lines.push(`  Total Test Cases : ${summary.totalTestCases}`);
    lines.push(`  Open Defects     : ${summary.totalDefectsOpen}`);
    lines.push(`  Pass Rate (7d)   : ${summary.passRate7d != null ? `${summary.passRate7d}%` : 'N/A'}`);
    lines.push(`  Coverage         : ${summary.coveragePct != null ? `${summary.coveragePct}%` : 'N/A'}`);
    lines.push('');

    if (summary.topFlakyTests.length > 0) {
      lines.push('-'.repeat(60));
      lines.push('Top Flaky Tests');
      lines.push('-'.repeat(60));
      for (const ft of summary.topFlakyTests) {
        lines.push(`  ${ft.title} (${ft.flakyCount} flaky runs)`);
      }
      lines.push('');
    }

    if (summary.recentRuns.length > 0) {
      lines.push('-'.repeat(60));
      lines.push('Recent Test Runs');
      lines.push('-'.repeat(60));
      for (const run of summary.recentRuns) {
        const name = (run as any).name ?? 'Unnamed';
        const status = (run as any).status;
        const started = (run as any).startedAt
          ? new Date((run as any).startedAt).toISOString()
          : 'N/A';
        lines.push(`  ${name} | ${status} | ${started}`);
      }
      lines.push('');
    }

    lines.push('='.repeat(60));
    lines.push('End of Report');
    lines.push('='.repeat(60));

    return Buffer.from(lines.join('\n'), 'utf-8');
  }
}
