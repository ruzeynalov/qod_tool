import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CryptoService } from '../../common/utils/crypto.service';
import { ConnectorRegistryService } from '../connector/connector-registry.service';
import {
  NormalizedTestCase,
  NormalizedTestRun,
  NormalizedTestResult,
  NormalizedDefect,
  NormalizedStory,
  NormalizedEpic,
  NormalizedPipelineRun,
  SyncError,
  ConnectorConfig as IConnectorConfig,
} from '@qod/shared';

/** Prisma interactive transaction client (the `tx` parameter inside $transaction callbacks). */
type PrismaTransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$use' | '$transaction' | '$extends'>;

/**
 * Union type that accepts both the full PrismaService and the transaction client.
 * Sync methods use this so they work both standalone and inside a transaction.
 */
type PrismaTx = PrismaService | PrismaTransactionClient;

interface SyncCounts {
  created: number;
  updated: number;
  errors: SyncError[];
}

/** Maps ConnectorType enum values to source strings used in entities. */
function connectorTypeToSource(connectorType: string): string {
  return connectorType.toLowerCase().replace(/_/g, '-');
}

/** Redact sensitive fields from an error message before logging. */
function redactCredentials(message: string): string {
  return message
    .replace(/(token|password|secret|apiKey|api_key|authorization)["\s:=]+[^\s,}"']*/gi, '$1=[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, 'Bearer [REDACTED]');
}

function countResultStatuses(results: NormalizedTestResult[]) {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let errored = 0;
  let flaky = 0;

  for (const r of results) {
    switch (r.status) {
      case 'PASSED':
        passed++;
        break;
      case 'FAILED':
        failed++;
        break;
      case 'SKIPPED':
        skipped++;
        break;
      case 'ERROR':
        errored++;
        break;
      case 'FLAKY':
        flaky++;
        break;
    }
  }

  return {
    totalTests: results.length,
    passedCount: passed,
    failedCount: failed,
    skippedCount: skipped,
    erroredCount: errored,
    flakyCount: flaky,
  };
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  /**
   * Per-project mutex to serialize connector syncs.  When GitHub and TestRail
   * connectors run concurrently for the same project the batch pre-fetch in
   * syncTestRuns may miss test cases that the other connector is about to
   * create, resulting in duplicate records with different `source` values.
   * Serializing syncs per project eliminates the race.
   */
  private readonly projectLocks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly connectorRegistry: ConnectorRegistryService,
  ) {}

  /**
   * Acquire a per-project lock so only one connector syncs at a time.
   * Returns a release function that MUST be called when done.
   */
  private async acquireProjectLock(projectId: string): Promise<() => void> {
    // Wait for any existing sync on this project to finish
    while (this.projectLocks.has(projectId)) {
      try {
        await this.projectLocks.get(projectId);
      } catch {
        // Previous sync failed — that's fine, we can proceed
      }
    }

    let release!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.projectLocks.set(projectId, lockPromise);

    return () => {
      this.projectLocks.delete(projectId);
      release();
    };
  }

  // ── syncTestCases ─────────────────────────────────────────

  async syncTestCases(
    projectId: string,
    connectorConfigId: string,
    testCases: NormalizedTestCase[],
    source: string,
    prisma: PrismaTx = this.prisma,
  ): Promise<SyncCounts> {
    const counts: SyncCounts = { created: 0, updated: 0, errors: [] };

    if (testCases.length === 0) return counts;

    // Batch pre-fetch: load ALL existing test cases for this project (cross-source)
    // so we can detect duplicates across connectors (e.g., same test in TestRail and GitHub).
    const existingTestCases = await prisma.testCase.findMany({
      where: { projectId, deletedAt: null },
    });
    // Same-source map: for normal upsert updates
    const sameSourceMap = new Map<string, (typeof existingTestCases)[number]>();
    // Cross-source map: keyed by externalId, any source — detects duplicates
    const crossSourceMap = new Map<string, (typeof existingTestCases)[number]>();
    for (const tc of existingTestCases) {
      if (!tc.externalId) continue;
      if (tc.source === source) {
        sameSourceMap.set(tc.externalId, tc);
      }
      // For cross-source, prefer records from OTHER sources so we detect
      // the existing record that would become a duplicate.
      const existing = crossSourceMap.get(tc.externalId);
      if (!existing || (existing.source === source && tc.source !== source)) {
        crossSourceMap.set(tc.externalId, tc);
      }
    }

    for (const tc of testCases) {
      try {
        const sameSource = sameSourceMap.get(tc.externalId);

        // If this externalId already exists under a DIFFERENT source (e.g.,
        // GitHub auto-created it from run results), update that record instead
        // of creating a duplicate with source=testrail.
        if (!sameSource) {
          const otherSource = crossSourceMap.get(tc.externalId);
          if (otherSource && otherSource.source !== source) {
            await prisma.testCase.update({
              where: { id: otherSource.id },
              data: {
                title: tc.title,
                // Preserve AUTOMATED status — never downgrade via sync
                automationStatus: otherSource.automationStatus === 'AUTOMATED'
                  ? 'AUTOMATED'
                  : tc.automationStatus,
                type: otherSource.automationStatus === 'AUTOMATED'
                  ? 'AUTOMATED'
                  : tc.type,
                suiteName: tc.suiteName ?? otherSource.suiteName,
                className: tc.className ?? otherSource.className,
                filePath: tc.filePath ?? otherSource.filePath,
                tags: tc.tags,
                references: tc.references ?? (otherSource as any).references,
                testRailType: tc.testRailType ?? (otherSource as any).testRailType,
              },
            });
            counts.updated++;
            continue;
          }
        }

        // Normal same-source upsert (update existing or create new)
        await prisma.testCase.upsert({
          where: {
            projectId_externalId_source: {
              projectId,
              externalId: tc.externalId,
              source,
            },
          },
          create: {
            projectId,
            externalId: tc.externalId,
            title: tc.title,
            type: tc.type,
            automationStatus: tc.automationStatus,
            suiteName: tc.suiteName,
            className: tc.className,
            filePath: tc.filePath,
            tags: tc.tags,
            references: tc.references,
            testRailType: tc.testRailType,
            source,
          },
          update: {
            title: tc.title,
            // Preserve AUTOMATED status — never downgrade via sync
            automationStatus: sameSource?.automationStatus === 'AUTOMATED'
              ? 'AUTOMATED'
              : tc.automationStatus,
            type: sameSource?.automationStatus === 'AUTOMATED'
              ? 'AUTOMATED'
              : tc.type,
            suiteName: tc.suiteName,
            className: tc.className,
            filePath: tc.filePath,
            tags: tc.tags,
            references: tc.references,
            testRailType: tc.testRailType,
          },
        });

        if (sameSource) {
          counts.updated++;
        } else {
          counts.created++;
        }
      } catch (error) {
        counts.errors.push({
          externalId: tc.externalId,
          entity: 'testCase',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return counts;
  }

  // ── syncTestRuns ──────────────────────────────────────────

  async syncTestRuns(
    projectId: string,
    connectorConfigId: string,
    testRuns: NormalizedTestRun[],
    source: string,
    prisma: PrismaTx = this.prisma,
  ): Promise<SyncCounts> {
    const counts: SyncCounts = { created: 0, updated: 0, errors: [] };

    if (testRuns.length === 0) return counts;

    // Batch pre-fetch: all existing test runs for created/updated detection
    const existingRuns = await prisma.testRun.findMany({
      where: { projectId, source, deletedAt: null },
      select: { externalId: true },
    });
    const existingRunSet = new Set(
      existingRuns.map(r => r.externalId).filter((id): id is string => id != null),
    );

    // Batch pre-fetch: all test cases for this project (for linking results)
    const allTestCases = await prisma.testCase.findMany({
      where: { projectId, deletedAt: null },
    });
    // Build lookup maps: any-source canonical map + source-specific fallback.
    // The canonical map prefers entries from richer sources (e.g. testrail)
    // over auto-created ones (github) to avoid creating duplicates when
    // linking test results from CI runs to existing test cases.
    const testCaseBySourceKey = new Map<string, (typeof allTestCases)[number]>();
    const testCaseByExternalId = new Map<string, (typeof allTestCases)[number]>();
    for (const tc of allTestCases) {
      if (!tc.externalId) continue;
      testCaseBySourceKey.set(`${tc.source}:${tc.externalId}`, tc);
      const existing = testCaseByExternalId.get(tc.externalId);
      // Prefer non-github entries (testrail has richer metadata) over
      // auto-created github entries; otherwise first match wins.
      if (!existing || (existing.source === source && tc.source !== source)) {
        testCaseByExternalId.set(tc.externalId, tc);
      }
    }

    for (const run of testRuns) {
      try {
        // Prefer connector-supplied summaryCounts when per-test results are
        // empty — e.g. GitHub workflow runs without parseable Allure
        // artifacts but with shard/job conclusions. Otherwise compute counts
        // from the actual test_results.
        const usingSummary = run.results.length === 0 && !!run.summaryCounts;
        const resultCounts = usingSummary
          ? {
              totalTests: run.summaryCounts!.totalTests,
              passedCount: run.summaryCounts!.passedCount,
              failedCount: run.summaryCounts!.failedCount,
              skippedCount: run.summaryCounts!.skippedCount ?? 0,
              erroredCount: run.summaryCounts!.erroredCount ?? 0,
              flakyCount: run.summaryCounts!.flakyCount ?? 0,
            }
          : countResultStatuses(run.results);
        // Default to TEST_RESULTS when neither side flagged the row — the
        // ConnectorService never relied on shard counts before this PR.
        const countSource = (run.countSource ?? (usingSummary ? 'CI_JOBS' : 'TEST_RESULTS')) as
          | 'TEST_RESULTS'
          | 'CI_JOBS';

        const existing = existingRunSet.has(run.externalId);

        const upsertedRun = await prisma.testRun.upsert({
          where: {
            projectId_externalId_source: {
              projectId,
              externalId: run.externalId,
              source,
            },
          },
          create: {
            projectId,
            externalId: run.externalId,
            name: run.name,
            triggerType: run.triggerType,
            branch: run.branch,
            sha: run.sha,
            environment: run.environment,
            startedAt: run.startedAt,
            finishedAt: run.finishedAt,
            durationMs: run.durationMs,
            status: run.status,
            isRerun: run.isRerun ?? false,
            source,
            countSource: countSource as any,
            ...resultCounts,
          },
          update: {
            name: run.name,
            triggerType: run.triggerType,
            branch: run.branch,
            sha: run.sha,
            environment: run.environment,
            startedAt: run.startedAt,
            finishedAt: run.finishedAt,
            durationMs: run.durationMs,
            status: run.status,
            isRerun: run.isRerun ?? false,
            countSource: countSource as any,
            ...resultCounts,
          },
        });

        // Clear old results and re-create for this run
        await prisma.testResult.deleteMany({
          where: { runId: upsertedRun.id },
        });

        const testCaseIdsToMarkAutomated: string[] = [];

        // Build batch of test results to create
        const resultDataBatch: Prisma.TestResultCreateManyInput[] = [];

        for (const result of run.results) {
          // Prefer canonical (any-source) match so CI results link to the
          // existing test case (e.g. from TestRail) instead of creating
          // a duplicate with source=github.  Fall back to source-specific.
          const existingTestCase =
            testCaseByExternalId.get(result.testExternalId) ??
            testCaseBySourceKey.get(`${source}:${result.testExternalId}`);

          // Auto-create test case for unmatched results so no data is lost.
          // Use upsert (not create) as defense-in-depth: if another connector
          // already created a record with the same (projectId, externalId, source)
          // between our pre-fetch and now, we link to it instead of failing.
          const testCase = existingTestCase ?? await (async () => {
            // First check if a test case with this externalId already exists
            // under ANY source (e.g. created by a concurrent TestRail sync).
            // If so, reuse it instead of creating a duplicate with source=github.
            const crossSourceMatch = await prisma.testCase.findFirst({
              where: {
                projectId,
                externalId: result.testExternalId,
                deletedAt: null,
              },
            });
            if (crossSourceMatch) {
              testCaseByExternalId.set(result.testExternalId, crossSourceMatch as any);
              return crossSourceMatch;
            }

            const created = await prisma.testCase.upsert({
              where: {
                projectId_externalId_source: {
                  projectId,
                  externalId: result.testExternalId,
                  source,
                },
              },
              create: {
                projectId,
                externalId: result.testExternalId,
                title: result.testTitle || result.testExternalId,
                type: 'AUTOMATED',
                automationStatus: 'AUTOMATED',
                suiteName: result.testSuiteName ?? null,
                className: result.testClassName ?? null,
                filePath: result.testFilePath ?? null,
                source,
              },
              update: {},
            });
            // Update lookup maps for subsequent runs in the same sync batch
            testCaseBySourceKey.set(`${source}:${result.testExternalId}`, created as any);
            testCaseByExternalId.set(result.testExternalId, created as any);
            return created;
          })();

          resultDataBatch.push({
            runId: upsertedRun.id,
            testCaseId: testCase.id,
            status: result.status as any,
            durationMs: result.durationMs,
            errorMessage: result.errorMessage,
            stackTrace: result.stackTrace,
            retryIndex: result.retryIndex ?? 0,
          });

          // Any test case that has CI execution results is automated.
          // Previously this only triggered for runs whose name matched
          // /automat/i, but a test case appearing in a GitHub Actions run
          // is sufficient proof of automation.
          if (testCase.automationStatus !== 'AUTOMATED') {
            testCaseIdsToMarkAutomated.push(testCase.id);
          }
        }

        // Batch create all test results
        if (resultDataBatch.length > 0) {
          await prisma.testResult.createMany({
            data: resultDataBatch,
          });
        }

        // Mark test cases from automation runs as automated
        if (testCaseIdsToMarkAutomated.length > 0) {
          await prisma.testCase.updateMany({
            where: { id: { in: testCaseIdsToMarkAutomated } },
            data: { automationStatus: 'AUTOMATED', type: 'AUTOMATED' },
          });
        }

        // Update lastExecutedAt for all test cases that have results in this run
        if (resultDataBatch.length > 0 && run.startedAt) {
          const testCaseIdsInRun = [...new Set(resultDataBatch.map(r => r.testCaseId).filter(Boolean) as string[])];
          if (testCaseIdsInRun.length > 0) {
            // Only update if this run is newer than the current lastExecutedAt
            await prisma.testCase.updateMany({
              where: {
                id: { in: testCaseIdsInRun },
                OR: [
                  { lastExecutedAt: null },
                  { lastExecutedAt: { lt: run.startedAt } },
                ],
              },
              data: { lastExecutedAt: run.startedAt },
            });
          }
        }

        if (existing) {
          counts.updated++;
        } else {
          counts.created++;
        }
      } catch (error) {
        counts.errors.push({
          externalId: run.externalId,
          entity: 'testRun',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return counts;
  }

  // ── syncDefects ───────────────────────────────────────────

  async syncDefects(
    projectId: string,
    connectorConfigId: string,
    defects: NormalizedDefect[],
    source: string,
    prisma: PrismaTx = this.prisma,
  ): Promise<SyncCounts> {
    const counts: SyncCounts = { created: 0, updated: 0, errors: [] };

    if (defects.length === 0) return counts;

    // Batch pre-fetch: existing defects for created/updated detection
    const existingDefects = await prisma.defect.findMany({
      where: { projectId, source, deletedAt: null },
    });
    const existingDefectMap = new Map<string, (typeof existingDefects)[number]>();
    for (const d of existingDefects) {
      if (d.externalId) existingDefectMap.set(d.externalId, d);
    }

    // Batch pre-fetch: all test cases for this project+source (for DefectTestLinks)
    const allTestCasesForDefects = await prisma.testCase.findMany({
      where: { projectId, source, deletedAt: null },
    });
    const testCaseMap = new Map<string, (typeof allTestCasesForDefects)[number]>();
    for (const tc of allTestCasesForDefects) {
      if (tc.externalId) testCaseMap.set(tc.externalId, tc);
    }

    for (const defect of defects) {
      try {
        const existing = existingDefectMap.get(defect.externalId);

        const upsertedDefect = await prisma.defect.upsert({
          where: {
            projectId_externalId_source: {
              projectId,
              externalId: defect.externalId,
              source,
            },
          },
          create: {
            projectId,
            externalId: defect.externalId,
            title: defect.title,
            url: defect.url,
            severity: defect.severity,
            priority: defect.priority,
            status: defect.status,
            component: defect.component,
            assignee: defect.assignee,
            labels: defect.labels ?? [],
            isEscaped: defect.isEscaped,
            reopenCount: defect.reopenCount,
            createdAt: defect.createdAt,
            resolvedAt: defect.resolvedAt,
            closedAt: defect.closedAt,
            changelog: defect.changelog as any,
            source,
          },
          update: {
            title: defect.title,
            url: defect.url,
            severity: defect.severity,
            priority: defect.priority,
            status: defect.status,
            component: defect.component,
            assignee: defect.assignee,
            labels: defect.labels ?? [],
            isEscaped: defect.isEscaped,
            reopenCount: defect.reopenCount,
            resolvedAt: defect.resolvedAt,
            closedAt: defect.closedAt,
            changelog: defect.changelog as any,
          },
        });

        // Create DefectTestLinks for linked test cases
        if (defect.linkedTestExternalIds?.length) {
          for (const testExtId of defect.linkedTestExternalIds) {
            const testCase = testCaseMap.get(testExtId);

            if (testCase) {
              await prisma.defectTestLink.upsert({
                where: {
                  defectId_testCaseId: {
                    defectId: upsertedDefect.id,
                    testCaseId: testCase.id,
                  },
                },
                create: {
                  defectId: upsertedDefect.id,
                  testCaseId: testCase.id,
                },
                update: {},
              });
            }
          }
        }

        if (existing) {
          counts.updated++;
        } else {
          counts.created++;
        }
      } catch (error) {
        counts.errors.push({
          externalId: defect.externalId,
          entity: 'defect',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return counts;
  }

  // ── syncEpics ──────────────────────────────────────────

  async syncEpics(
    projectId: string,
    epics: NormalizedEpic[],
    source: string,
    prisma: PrismaTx = this.prisma,
  ): Promise<SyncCounts> {
    const counts: SyncCounts = { created: 0, updated: 0, errors: [] };

    if (epics.length === 0) return counts;

    // Batch pre-fetch: existing epics for created/updated detection
    const existingEpics = await prisma.epic.findMany({
      where: { projectId, source },
      select: { externalId: true },
    });
    const existingEpicSet = new Set(
      existingEpics.map(e => e.externalId).filter((id): id is string => id != null),
    );

    for (const epic of epics) {
      try {
        const existing = existingEpicSet.has(epic.externalId);

        await prisma.epic.upsert({
          where: {
            projectId_externalId_source: {
              projectId,
              externalId: epic.externalId,
              source,
            },
          },
          create: {
            projectId,
            externalId: epic.externalId,
            title: epic.title,
            url: epic.url,
            status: epic.status,
            source,
          },
          update: {
            title: epic.title,
            url: epic.url,
            status: epic.status,
          },
        });

        if (existing) {
          counts.updated++;
        } else {
          counts.created++;
        }
      } catch (error) {
        counts.errors.push({
          externalId: epic.externalId,
          entity: 'epic',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return counts;
  }

  // ── syncStories ─────────────────────────────────────────

  async syncStories(
    projectId: string,
    connectorConfigId: string,
    stories: NormalizedStory[],
    source: string,
    prisma: PrismaTx = this.prisma,
  ): Promise<SyncCounts> {
    const counts: SyncCounts = { created: 0, updated: 0, errors: [] };

    if (stories.length === 0) return counts;

    // Batch pre-fetch: existing stories for created/updated detection
    const existingStories = await prisma.story.findMany({
      where: { projectId, source },
      select: { externalId: true },
    });
    const existingStorySet = new Set(
      existingStories.map(s => s.externalId).filter((id): id is string => id != null),
    );

    // Batch pre-fetch: all epics for this project+source for epicKey → epicId resolution
    const allEpics = await prisma.epic.findMany({
      where: { projectId, source },
      select: { id: true, externalId: true },
    });
    const epicMap = new Map<string, string>();
    for (const epic of allEpics) {
      if (epic.externalId) epicMap.set(epic.externalId, epic.id);
    }

    for (const story of stories) {
      try {
        const existing = existingStorySet.has(story.externalId);

        // Resolve epicKey → epicId from pre-fetched map
        const epicId = story.epicKey ? epicMap.get(story.epicKey) : undefined;

        await prisma.story.upsert({
          where: {
            projectId_externalId_source: {
              projectId,
              externalId: story.externalId,
              source,
            },
          },
          create: {
            projectId,
            externalId: story.externalId,
            title: story.title,
            url: story.url,
            status: story.status as any,
            storyPoints: story.storyPoints,
            assignee: story.assignee,
            component: story.component,
            labels: story.labels,
            epicId,
            createdAt: story.createdAt,
            resolvedAt: story.resolvedAt,
            source,
          },
          update: {
            title: story.title,
            url: story.url,
            status: story.status as any,
            storyPoints: story.storyPoints,
            assignee: story.assignee,
            component: story.component,
            labels: story.labels,
            epicId,
            resolvedAt: story.resolvedAt,
          },
        });

        if (existing) {
          counts.updated++;
        } else {
          counts.created++;
        }
      } catch (error) {
        counts.errors.push({
          externalId: story.externalId,
          entity: 'story',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return counts;
  }

  // ── syncPipelineRuns ──────────────────────────────────────

  async syncPipelineRuns(
    projectId: string,
    connectorConfigId: string,
    pipelineRuns: NormalizedPipelineRun[],
    source: string,
    prisma: PrismaTx = this.prisma,
  ): Promise<SyncCounts> {
    const counts: SyncCounts = { created: 0, updated: 0, errors: [] };

    if (pipelineRuns.length === 0) return counts;

    // Batch pre-fetch: existing pipeline runs for created/updated detection
    const existingPipelineRuns = await prisma.pipelineRun.findMany({
      where: { projectId, source },
      select: { externalId: true },
    });
    const existingPipelineSet = new Set(
      existingPipelineRuns.map(p => p.externalId).filter((id): id is string => id != null),
    );

    for (const pipeline of pipelineRuns) {
      try {
        const existing = existingPipelineSet.has(pipeline.externalId);

        await prisma.pipelineRun.upsert({
          where: {
            projectId_externalId_source: {
              projectId,
              externalId: pipeline.externalId,
              source,
            },
          },
          create: {
            projectId,
            externalId: pipeline.externalId,
            workflowName: pipeline.workflowName,
            branch: pipeline.branch,
            sha: pipeline.sha,
            status: pipeline.status,
            durationMs: pipeline.durationMs,
            triggeredBy: pipeline.triggeredBy,
            startedAt: pipeline.startedAt,
            finishedAt: pipeline.finishedAt,
            url: pipeline.url,
            jobs: pipeline.jobs as any,
            source,
          },
          update: {
            workflowName: pipeline.workflowName,
            branch: pipeline.branch,
            sha: pipeline.sha,
            status: pipeline.status,
            durationMs: pipeline.durationMs,
            triggeredBy: pipeline.triggeredBy,
            startedAt: pipeline.startedAt,
            finishedAt: pipeline.finishedAt,
            url: pipeline.url,
            jobs: pipeline.jobs as any,
          },
        });

        if (existing) {
          counts.updated++;
        } else {
          counts.created++;
        }
      } catch (error) {
        counts.errors.push({
          externalId: pipeline.externalId,
          entity: 'pipelineRun',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return counts;
  }

  // ── executeSyncJob ────────────────────────────────────────

  async executeSyncJob(connectorConfigId: string): Promise<{ logs: string[] }> {
    const logs: string[] = [];
    let connectorConfig: any;

    try {
      connectorConfig = await this.prisma.connectorConfig.findUniqueOrThrow({
        where: { id: connectorConfigId },
      });
    } catch (error) {
      this.logger.error(
        `Failed to load connector config ${connectorConfigId}: ${error}`,
      );
      throw new Error(`Connector config not found: ${connectorConfigId}`);
    }

    const connectorType = connectorConfig.connectorType as string;
    const source = connectorTypeToSource(connectorType);
    const connector = this.connectorRegistry.get(connectorType.toLowerCase());

    if (!connector) {
      const errorMsg = `Connector not found in registry: ${connectorType}`;
      await this.prisma.connectorConfig.update({
        where: { id: connectorConfigId },
        data: {
          status: 'ERROR',
          lastSyncAt: new Date(),
          lastSyncError: errorMsg,
        },
      });
      throw new Error(errorMsg);
    }

    // Mark as syncing
    await this.prisma.connectorConfig.update({
      where: { id: connectorConfigId },
      data: { status: 'SYNCING' },
    });

    try {
      const since = connectorConfig.lastSyncAt ?? undefined;

      // Decrypt credentials before passing to connector
      let credentials = connectorConfig.credentials;
      if (typeof credentials === 'string') {
        credentials = this.crypto.decryptJSON(credentials);
      }

      const configPayload: IConnectorConfig = {
        id: connectorConfig.id,
        connectorType: connectorConfig.connectorType,
        credentials: credentials as Record<string, unknown>,
        fieldMapping: connectorConfig.fieldMapping as Record<string, string>,
        syncSchedule: connectorConfig.syncSchedule,
        syncCursor: connectorConfig.syncCursor as
          | Record<string, unknown>
          | undefined,
      };

      const addLog = (msg: string) => { logs.push(msg); this.logger.log(msg); };

      // Fetch data from connectors (outside transaction — network I/O)
      let testCases: NormalizedTestCase[] | undefined;
      let testRuns: NormalizedTestRun[] | undefined;
      let defects: NormalizedDefect[] | undefined;
      let epics: NormalizedEpic[] | undefined;
      let stories: NormalizedStory[] | undefined;
      let pipelineRuns: NormalizedPipelineRun[] | undefined;

      if (connector.fetchTestCases) {
        addLog(`Fetching test cases from ${connectorType}…`);
        testCases = await connector.fetchTestCases(configPayload, since);
        addLog(`Fetched ${testCases.length} test cases`);
      }

      let testRunSyncWarning: string | null = null;
      if (connector.fetchTestRuns) {
        addLog(`Fetching test runs from ${connectorType}…`);
        testRuns = await connector.fetchTestRuns(configPayload, since);
        addLog(`Fetched ${testRuns.length} test runs`);

        // Step 5: collect connector-side diagnostics (e.g. GitHub artifact-
        // name mismatches) and surface them as a soft warning on the
        // connector status. Hard errors keep using lastSyncError; this is
        // the "sync ran fine but configuration looks suspect" channel.
        const diagFn = (connector as { getDiagnostics?: () => unknown }).getDiagnostics;
        if (typeof diagFn === 'function') {
          const diag = diagFn.call(connector) as {
            completedRuns?: number;
            runsWithoutMatchedArtifacts?: number;
            sampleUnmatchedArtifactNames?: string[];
          } | null;
          if (
            diag &&
            (diag.runsWithoutMatchedArtifacts ?? 0) >= 3 &&
            (diag.completedRuns ?? 0) > 0 &&
            (diag.sampleUnmatchedArtifactNames?.length ?? 0) > 0
          ) {
            const sample = diag.sampleUnmatchedArtifactNames!.slice(0, 5).join(', ');
            testRunSyncWarning =
              `${diag.runsWithoutMatchedArtifacts}/${diag.completedRuns} runs uploaded artifacts ` +
              `that did not match the connector pattern. ` +
              `Saw [${sample}${diag.sampleUnmatchedArtifactNames!.length > 5 ? ', …' : ''}]. ` +
              `Configure 'artifactPattern' in connector settings to point at your test-result artifacts.`;
            addLog(`WARNING: ${testRunSyncWarning}`);
          }
        }
      }

      if (connector.fetchDefects) {
        addLog(`Fetching defects from ${connectorType}…`);
        defects = await connector.fetchDefects(configPayload, since);
        addLog(`Fetched ${defects.length} defects`);
      }

      if (connector.fetchEpics) {
        addLog(`Fetching epics from ${connectorType}…`);
        epics = await connector.fetchEpics(configPayload);
        addLog(`Fetched ${epics.length} epics`);
      }

      if (connector.fetchStories) {
        addLog(`Fetching stories from ${connectorType}…`);
        stories = await connector.fetchStories(configPayload, since);
        addLog(`Fetched ${stories.length} stories`);
      }

      if (connector.fetchPipelineRuns) {
        addLog(`Fetching pipeline runs from ${connectorType}…`);
        pipelineRuns = await connector.fetchPipelineRuns(configPayload, since);
        addLog(`Fetched ${pipelineRuns.length} pipeline runs`);
      }

      // Acquire per-project lock to prevent concurrent connector syncs from
      // creating duplicate test cases with different source values.
      const releaseProjectLock = await this.acquireProjectLock(connectorConfig.projectId);

      // Sync all data inside a transaction for atomicity
      // Increase timeout from default 5s to 30s — large syncs (e.g. 2000+ TestRail test cases) exceed the default
      try {
      await this.prisma.$transaction(async (tx: PrismaTx) => {
        if (testCases !== undefined) {
          const tcCounts = await this.syncTestCases(
            connectorConfig.projectId,
            connectorConfigId,
            testCases,
            source,
            tx,
          );
          addLog(`Test cases: ${tcCounts.created} created, ${tcCounts.updated} updated, ${tcCounts.errors.length} errors`);
        }

        if (testRuns !== undefined) {
          const trCounts = await this.syncTestRuns(
            connectorConfig.projectId,
            connectorConfigId,
            testRuns,
            source,
            tx,
          );
          addLog(`Test runs: ${trCounts.created} created, ${trCounts.updated} updated, ${trCounts.errors.length} errors`);
        }

        if (defects !== undefined) {
          const defectCounts = await this.syncDefects(
            connectorConfig.projectId,
            connectorConfigId,
            defects,
            source,
            tx,
          );
          addLog(`Defects: ${defectCounts.created} created, ${defectCounts.updated} updated, ${defectCounts.errors.length} errors`);
          if (defectCounts.errors.length > 0) {
            this.logger.warn(`Defect sync errors: ${JSON.stringify(defectCounts.errors.slice(0, 5))}`);
          }
        }

        if (epics !== undefined) {
          const epicCounts = await this.syncEpics(
            connectorConfig.projectId,
            epics,
            source,
            tx,
          );
          addLog(`Epics: ${epicCounts.created} created, ${epicCounts.updated} updated, ${epicCounts.errors.length} errors`);
        }

        if (stories !== undefined) {
          const storyCounts = await this.syncStories(
            connectorConfig.projectId,
            connectorConfigId,
            stories,
            source,
            tx,
          );
          addLog(`Stories: ${storyCounts.created} created, ${storyCounts.updated} updated, ${storyCounts.errors.length} errors`);
        }

        if (pipelineRuns !== undefined) {
          await this.syncPipelineRuns(
            connectorConfig.projectId,
            connectorConfigId,
            pipelineRuns,
            source,
            tx,
          );
          addLog(`Synced ${pipelineRuns.length} pipeline runs`);
        }
      }, { timeout: 120000 });
      } finally {
        releaseProjectLock();
      }

      // Count total records fetched to decide whether to advance the sync cursor
      const totalFetched =
        (testCases?.length ?? 0) +
        (testRuns?.length ?? 0) +
        (defects?.length ?? 0) +
        (epics?.length ?? 0) +
        (stories?.length ?? 0) +
        (pipelineRuns?.length ?? 0);

      // Success
      addLog(`Sync completed successfully. Total records: ${totalFetched}`);
      const updateData: Record<string, any> = {
        status: 'ACTIVE',
        lastSyncError: null,
        // Persist (or clear) the soft sync warning collected from connector
        // diagnostics — null means the connector looked healthy this run.
        lastSyncWarning: testRunSyncWarning,
      };

      // Only advance lastSyncAt if we actually fetched data.
      // This prevents an empty first sync (e.g. due to credential issues)
      // from permanently blocking all historical data on subsequent syncs.
      if (totalFetched > 0) {
        const now = new Date();
        updateData.lastSyncAt = now;
        updateData.syncCursor = { lastSyncAt: now.toISOString() };
      }

      await this.prisma.connectorConfig.update({
        where: { id: connectorConfigId },
        data: updateData,
      });
      return { logs };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Sync failed for connector ${connectorConfigId}: ${redactCredentials(errorMsg)}`,
      );
      // Don't advance lastSyncAt on failure — the next sync should retry
      // the same time window instead of skipping over it.
      await this.prisma.connectorConfig.update({
        where: { id: connectorConfigId },
        data: {
          status: 'ERROR',
          lastSyncError:
            error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }
}
