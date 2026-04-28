/**
 * Demo data seed.
 *
 * Populates each project flagged demoMode = true (created by seed.ts) with
 * realistic feature areas, test cases, test runs, test results, defects,
 * stories, and pipeline runs. Driven by the deterministic generator in
 * @qod/shared so re-runs against the same seed produce identical data and
 * the script stays idempotent — if the project already has any test cases
 * with source = 'demo-seed', the project is skipped.
 *
 * Why this exists: seed.ts only creates the org / users / projects / KPI
 * targets. With nothing in test_cases / test_results / defects, every KPI
 * (and every formula configurator preview) resolves to zero. This seed
 * fills that gap so a fresh `docker:up` produces a meaningful dashboard.
 */

import { PrismaClient } from '@prisma/client';
import {
  generateDemoData,
  DEFAULT_DEMO_CONFIG,
  type DemoConfig,
  type DemoDataSet,
} from '@qod/shared';

const prisma = new PrismaClient();

// Per-project generator overrides. Slugs match seed.ts → DEMO_PROJECTS.
const PROJECT_CONFIGS: Record<string, Partial<DemoConfig>> = {
  'e-commerce-platform': {
    projectName: 'E-Commerce Platform',
    seed: 42,
    testCaseCount: 420,
    defectCount: 95,
    passRateMean: 0.88,
    flakyTestPct: 0.07,
    avgRunsPerDay: 5,
    featureAreas: [
      'Authentication', 'Payments', 'Cart', 'Inventory',
      'Search', 'Recommendations', 'Checkout', 'User Profile',
      'Notifications', 'Shipping',
    ],
  },
  'mobile-banking-app': {
    projectName: 'Mobile Banking App',
    seed: 137,
    testCaseCount: 310,
    defectCount: 72,
    passRateMean: 0.92,
    flakyTestPct: 0.05,
    avgRunsPerDay: 3,
    featureAreas: [
      'Authentication', 'Accounts', 'Transfers', 'Bill Pay',
      'Lending', 'Cards', 'Notifications', 'Settings',
      'Security', 'Onboarding',
    ],
  },
  'internal-tools': {
    projectName: 'Internal Tools',
    seed: 256,
    testCaseCount: 180,
    defectCount: 48,
    passRateMean: 0.82,
    flakyTestPct: 0.12,
    avgRunsPerDay: 2,
    featureAreas: [
      'Admin Panel', 'User Management', 'Reporting',
      'API Gateway', 'Monitoring', 'Developer Portal',
      'CI Dashboard', 'Config Management',
    ],
  },
};

const SOURCE = 'demo-seed';

async function seedProject(slug: string, projectId: string, config: Partial<DemoConfig>) {
  const existing = await prisma.testCase.count({ where: { projectId, source: SOURCE } });
  if (existing > 0) {
    console.log(`  ${slug}: ${existing} demo test cases already present, skipping.`);
    return;
  }

  const fullConfig = { ...DEFAULT_DEMO_CONFIG, ...config };
  const data: DemoDataSet = generateDemoData(fullConfig);

  // 1. Feature areas (FK target for test cases + defects)
  await prisma.featureArea.createMany({
    data: data.featureAreas.map((fa) => ({
      id: fa.id,
      projectId,
      name: fa.name,
      color: fa.color,
    })),
    skipDuplicates: true,
  });
  console.log(`  ${slug}: featureAreas=${data.featureAreas.length}`);

  // 2. Pipeline runs (FK target for test runs)
  await prisma.pipelineRun.createMany({
    data: data.pipelineRuns.map((pr) => ({
      id: pr.id,
      projectId,
      workflowName: pr.workflowName,
      branch: pr.branch ?? null,
      sha: pr.sha ?? null,
      status: pr.status as any,
      durationMs: pr.durationMs ?? null,
      triggeredBy: pr.triggeredBy ?? null,
      startedAt: new Date(pr.startedAt),
      finishedAt: new Date(new Date(pr.startedAt).getTime() + (pr.durationMs ?? 0)),
      jobs: [] as any,
      source: 'github',
    })),
    skipDuplicates: true,
  });
  console.log(`  ${slug}: pipelineRuns=${data.pipelineRuns.length}`);

  // 3. Test cases
  await prisma.testCase.createMany({
    data: data.testCases.map((tc) => ({
      id: tc.id,
      projectId,
      externalId: tc.externalId,
      title: tc.title,
      type: tc.type as any,
      automationStatus: tc.automationStatus as any,
      featureAreaId: tc.featureAreaId,
      tags: tc.tags,
      source: SOURCE,
      suiteName: tc.suiteName,
      references: tc.references ?? null,
      testRailType: tc.testRailType ?? null,
      lastExecutedAt: tc.lastExecutedAt ? new Date(tc.lastExecutedAt) : null,
    })),
    skipDuplicates: true,
  });
  console.log(`  ${slug}: testCases=${data.testCases.length}`);

  // 4. Test runs
  await prisma.testRun.createMany({
    data: data.testRuns.map((run) => ({
      id: run.id,
      projectId,
      name: run.name,
      triggerType: run.triggerType as any,
      branch: run.branch,
      sha: run.sha,
      environment: run.environment,
      startedAt: new Date(run.startedAt),
      finishedAt: new Date(new Date(run.startedAt).getTime() + run.durationMs),
      durationMs: run.durationMs,
      status: run.status as any,
      totalTests: run.totalTests,
      passedCount: run.passedCount,
      failedCount: run.failedCount,
      skippedCount: run.skippedCount,
      erroredCount: run.erroredCount,
      flakyCount: run.flakyCount,
      isRerun: run.isRerun,
      originalRunId: run.originalRunId,
      pipelineRunId: run.pipelineRunId,
      source: 'github',
    })),
    skipDuplicates: true,
  });
  console.log(`  ${slug}: testRuns=${data.testRuns.length}`);

  // 5. Test results — flatten all runs' results, stamp with createdAt = run.startedAt
  //    so MTTD calculations have realistic per-result timestamps.
  const allResults = data.testRuns.flatMap((run) =>
    run.results.map((r) => ({
      id: r.id,
      runId: run.id,
      testCaseId: r.testCaseId,
      status: r.status as any,
      durationMs: r.durationMs,
      errorMessage: r.errorMessage ?? null,
      retryIndex: 0,
      createdAt: new Date(new Date(run.startedAt).getTime() + Math.random() * run.durationMs),
    })),
  );

  // Bulk insert in chunks to avoid huge single statements.
  const chunkSize = 5000;
  for (let i = 0; i < allResults.length; i += chunkSize) {
    await prisma.testResult.createMany({
      data: allResults.slice(i, i + chunkSize),
      skipDuplicates: true,
    });
  }
  console.log(`  ${slug}: testResults=${allResults.length}`);

  // 6. Defects
  await prisma.defect.createMany({
    data: data.defects.map((d) => ({
      id: d.id,
      projectId,
      externalId: d.externalId,
      title: d.title,
      url: d.url ?? null,
      severity: d.severity as any,
      priority: d.priority as any,
      status: d.status as any,
      component: d.component,
      featureAreaId: d.featureAreaId,
      labels: d.labels,
      isEscaped: d.isEscaped,
      reopenCount: d.reopenCount,
      createdAt: new Date(d.createdAt),
      resolvedAt: d.resolvedAt ? new Date(d.resolvedAt) : null,
      closedAt: d.closedAt ? new Date(d.closedAt) : null,
      source: 'jira',
      changelog: d.changelog as any,
    })),
    skipDuplicates: true,
  });
  console.log(`  ${slug}: defects=${data.defects.length}`);

  // 7. Stories
  await prisma.story.createMany({
    data: data.stories.map((s) => ({
      id: s.id,
      projectId,
      externalId: s.externalId,
      title: s.title,
      url: s.url,
      status: s.status as any,
      storyPoints: s.storyPoints,
      assignee: s.assignee,
      component: s.component,
      labels: s.labels,
      source: 'jira',
      createdAt: new Date(s.createdAt),
      resolvedAt: s.resolvedAt ? new Date(s.resolvedAt) : null,
    })),
    skipDuplicates: true,
  });
  console.log(`  ${slug}: stories=${data.stories.length}`);

  // 8. KPI snapshots — ship a 30-day history derived from the generator so
  //    the dashboard sparkline renders something interesting on first view.
  await prisma.kPISnapshot.createMany({
    data: data.kpiSnapshots.map((s) => ({
      projectId,
      metric: s.metric as any,
      value: s.value,
      target: s.target,
      recordedAt: new Date(s.recordedAt),
    })),
    skipDuplicates: true,
  });
  console.log(`  ${slug}: kpiSnapshots=${data.kpiSnapshots.length}`);
}

async function main() {
  console.log('Seeding demo data...');

  const projects = await prisma.project.findMany({
    where: { demoMode: true, deletedAt: null },
    select: { id: true, slug: true, name: true },
  });

  if (projects.length === 0) {
    console.log('No demo projects found. Run seed.ts first.');
    return;
  }

  for (const p of projects) {
    const config = PROJECT_CONFIGS[p.slug];
    if (!config) {
      console.log(`  ${p.slug}: no demo config, skipping.`);
      continue;
    }
    console.log(`Project: ${p.name} (${p.slug})`);
    await seedProject(p.slug, p.id, config);
  }

  console.log('Demo seed completed successfully.');
}

main()
  .catch((error) => {
    console.error('Demo seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
