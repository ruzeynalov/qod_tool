// Single source of truth for the KPI formula registry. Lives in @qod/shared
// because both the API (validation + compute) and the web client (demo-mode
// preview + UI) consume the same data. Validators that hit the database are
// kept in the API package.
//
// Every metric exposes a fully editable math expression over a set of named
// scalar variables. Filter-style parameters (windowDays, regex, status sets
// used for SQL filters) stay separate so the user does not have to hand-roll
// query predicates inside the expression. Pure aggregation choices that used
// to be enums (mean vs. median) are exposed instead as alternative variables
// the expression can reference.

import {
  TEST_RESULT_STATUSES,
  DEFECT_STATUSES,
  DEFECT_SEVERITIES,
} from '../interfaces/enums';
import type {
  FormulaDefinition,
  FormulaParameters,
  KPIMetricKey,
  ResolvedFormulaConfig,
} from '../interfaces/kpi-formula.interface';

export const KPI_FORMULA_DEFINITIONS: Record<KPIMetricKey, FormulaDefinition> = {
  COVERAGE_PCT: {
    metric: 'COVERAGE_PCT',
    category: 'testing',
    label: 'Automation Coverage',
    description:
      'What percentage of your test cases are automated? Higher coverage means less manual testing effort.',
    formulaText:
      'expression evaluated against {automatedCount, notAutomatedCount, needsUpdateCount, totalTestCases}',
    direction: 'higher',
    unit: '%',
    expressionEditable: true,
    expressionVariables: [
      'automatedCount',
      'notAutomatedCount',
      'needsUpdateCount',
      'totalTestCases',
    ],
    defaultExpression: '100 * automatedCount / totalTestCases',
    howItWorks:
      'Counts of test cases grouped by automationStatus are exposed as variables; write any expression that combines them. Allowed functions: min, max, abs, round, sqrt, floor, ceil.',
    variables: [],
  },

  PASS_RATE_7D: {
    metric: 'PASS_RATE_7D',
    category: 'testing',
    label: 'Pass Rate (7d)',
    description:
      'Of all test results in the past N days, what percentage passed? A recent snapshot of test health.',
    formulaText:
      'expression evaluated against per-status counts in the chosen window',
    direction: 'higher',
    unit: '%',
    expressionEditable: true,
    expressionVariables: [
      'passedResults',
      'failedResults',
      'skippedResults',
      'errorResults',
      'flakyResults',
      'totalResults',
      'windowDays',
    ],
    defaultExpression: '100 * passedResults / totalResults',
    howItWorks:
      'You can include FLAKY in your numerator if you want, e.g. 100 * (passedResults + flakyResults) / totalResults — the SQL query produces all per-status counts within the chosen window.',
    variables: [
      {
        name: 'windowDays',
        label: 'Window',
        kind: 'window',
        defaultValue: 7,
        min: 1,
        max: 365,
        unit: 'days',
      },
    ],
  },

  PASS_RATE_30D: {
    metric: 'PASS_RATE_30D',
    category: 'testing',
    label: 'Pass Rate (30d)',
    description:
      'Same as the 7-day pass rate but over a longer window. Shows longer-term test stability.',
    formulaText:
      'expression evaluated against per-status counts in the chosen window',
    direction: 'higher',
    unit: '%',
    expressionEditable: true,
    expressionVariables: [
      'passedResults',
      'failedResults',
      'skippedResults',
      'errorResults',
      'flakyResults',
      'totalResults',
      'windowDays',
    ],
    defaultExpression: '100 * passedResults / totalResults',
    variables: [
      {
        name: 'windowDays',
        label: 'Window',
        kind: 'window',
        defaultValue: 30,
        min: 1,
        max: 365,
        unit: 'days',
      },
    ],
  },

  FLAKY_RATE: {
    metric: 'FLAKY_RATE',
    category: 'testing',
    label: 'Flaky Test Rate',
    description:
      'What percentage of automated tests are flaky? A flaky test flips between PASS and FAIL across recent runs.',
    formulaText:
      'expression evaluated against {flakyTestCount, automatedTestCount, runCount}',
    direction: 'lower',
    unit: '%',
    expressionEditable: true,
    expressionVariables: ['flakyTestCount', 'automatedTestCount', 'runCount'],
    defaultExpression: '100 * flakyTestCount / automatedTestCount',
    howItWorks:
      'A test is flagged flaky if it shows at least minTransitions PASS↔FAIL transitions across the runs in the window. Window and minTransitions configure the detection algorithm; the expression then turns the resulting counts into the metric you want.',
    variables: [
      {
        name: 'windowDays',
        label: 'Look-back window',
        kind: 'window',
        defaultValue: 90,
        min: 7,
        max: 365,
        unit: 'days',
      },
      {
        name: 'minTransitions',
        label: 'Min PASS↔FAIL transitions',
        kind: 'integer',
        defaultValue: 2,
        min: 1,
        max: 10,
      },
      {
        name: 'automatedStatuses',
        label: 'Considered automated',
        kind: 'statusSet',
        defaultValue: ['AUTOMATED'],
        enumOptions: ['AUTOMATED', 'NOT_AUTOMATED', 'NEEDS_UPDATE'],
      },
    ],
  },

  MTTD_HOURS: {
    metric: 'MTTD_HOURS',
    category: 'testing',
    label: 'Mean Time to Detect',
    description:
      'How quickly does CI detect failures after a run starts? Lower means problems are caught faster.',
    formulaText:
      'expression evaluated against {meanFailureLatencyHours, medianFailureLatencyHours, failedRunCount}',
    direction: 'lower',
    unit: 'hours',
    expressionEditable: true,
    expressionVariables: [
      'meanFailureLatencyHours',
      'medianFailureLatencyHours',
      'failedRunCount',
    ],
    defaultExpression: 'meanFailureLatencyHours',
    howItWorks:
      'For each failing run we compute the time from runStart to the first failed test result. Both mean and median across those latencies are exposed; pick (or combine) whichever you prefer in the expression.',
    variables: [
      {
        name: 'requireSha',
        label: 'Require git SHA on run',
        description: 'Only include runs that are linked to a git commit.',
        kind: 'boolean',
        defaultValue: true,
      },
      {
        name: 'failedStatuses',
        label: 'Counted as failure',
        kind: 'statusSet',
        defaultValue: ['FAILED'],
        enumOptions: [...TEST_RESULT_STATUSES],
      },
    ],
  },

  MTTR_HOURS: {
    metric: 'MTTR_HOURS',
    category: 'defect',
    label: 'Median Time to Resolve',
    description:
      'How long does it take to resolve defects? Default uses the median to avoid outlier skew.',
    formulaText:
      'expression evaluated against {meanResolutionHours, medianResolutionHours, p90ResolutionHours, resolvedDefectCount}',
    direction: 'lower',
    unit: 'hours',
    expressionEditable: true,
    expressionVariables: [
      'meanResolutionHours',
      'medianResolutionHours',
      'p90ResolutionHours',
      'resolvedDefectCount',
    ],
    defaultExpression: 'medianResolutionHours',
    howItWorks:
      'Median is the default to reduce skew from a single long-lived outlier. Switch to mean by writing meanResolutionHours, or look at the tail with p90ResolutionHours.',
    variables: [
      {
        name: 'windowDays',
        label: 'Window',
        kind: 'window',
        defaultValue: 90,
        min: 7,
        max: 720,
        unit: 'days',
      },
    ],
  },

  ESCAPE_RATE: {
    metric: 'ESCAPE_RATE',
    category: 'defect',
    label: 'Defect Escape Rate',
    description:
      'What percentage of defects escaped to production rather than being caught in testing?',
    formulaText:
      'expression evaluated against {escapedDefectCount, totalDefectCount}',
    direction: 'lower',
    unit: '%',
    expressionEditable: true,
    expressionVariables: ['escapedDefectCount', 'totalDefectCount'],
    defaultExpression: '100 * escapedDefectCount / totalDefectCount',
    variables: [],
  },

  EXEC_VELOCITY: {
    metric: 'EXEC_VELOCITY',
    category: 'testing',
    label: 'Execution Velocity',
    description: 'Average number of test runs per day across the chosen window.',
    formulaText: 'expression evaluated against {runCount, windowDays}',
    direction: 'higher',
    unit: 'runs/day',
    expressionEditable: true,
    expressionVariables: ['runCount', 'windowDays'],
    defaultExpression: 'runCount / windowDays',
    variables: [
      {
        name: 'windowDays',
        label: 'Window',
        kind: 'window',
        defaultValue: 7,
        min: 1,
        max: 90,
        unit: 'days',
      },
    ],
  },

  REQ_COVERAGE: {
    metric: 'REQ_COVERAGE',
    category: 'composite',
    label: 'Requirement Coverage',
    description:
      'Percentage of stories that have at least one test case referencing their key.',
    formulaText:
      'expression evaluated against {coveredStoryCount, uncoveredStoryCount, totalStoryCount}',
    direction: 'higher',
    unit: '%',
    expressionEditable: true,
    expressionVariables: ['coveredStoryCount', 'uncoveredStoryCount', 'totalStoryCount'],
    defaultExpression: '100 * coveredStoryCount / totalStoryCount',
    variables: [
      {
        name: 'referencePattern',
        label: 'Reference pattern (regex)',
        description:
          'Regex applied to TestCase.references to extract story keys. Default matches Jira-style keys like PS-123.',
        kind: 'regex',
        defaultValue: '[A-Z]+-\\d+',
      },
    ],
  },

  DEFECT_DENSITY: {
    metric: 'DEFECT_DENSITY',
    category: 'defect',
    label: 'Defect Density',
    description:
      'Open defects per 100 test cases. Lower density means fewer outstanding issues per test.',
    formulaText:
      'expression evaluated against {openDefectCount, totalTestCases}',
    direction: 'lower',
    unit: '%',
    expressionEditable: true,
    expressionVariables: ['openDefectCount', 'totalTestCases'],
    defaultExpression: '100 * openDefectCount / totalTestCases',
    variables: [
      {
        name: 'openStatuses',
        label: 'Counted as open',
        kind: 'statusSet',
        defaultValue: ['OPEN', 'IN_PROGRESS', 'REOPENED'],
        enumOptions: [...DEFECT_STATUSES],
      },
    ],
  },

  READINESS_SCORE: {
    metric: 'READINESS_SCORE',
    category: 'composite',
    label: 'Release Readiness',
    description:
      'A weighted composite score combining multiple KPIs into a single release-readiness indicator.',
    formulaText:
      'expression evaluated against {passRate7d, passRate30d, coverage, flakyRate, mttdHours, mttrHours, escapeRate, execVelocity, reqCoverage, defectDensity, criticalRatio}',
    direction: 'higher',
    unit: 'score',
    expressionEditable: true,
    expressionVariables: [
      'passRate7d',
      'passRate30d',
      'coverage',
      'flakyRate',
      'mttdHours',
      'mttrHours',
      'escapeRate',
      'execVelocity',
      'reqCoverage',
      'defectDensity',
      'criticalRatio',
    ],
    defaultExpression: '0.4 * passRate7d + 0.3 * coverage + 0.3 * (100 - criticalRatio)',
    howItWorks:
      'criticalRatio = (open critical defects / total defects) × 100. Allowed functions in the expression: min, max, abs, round, sqrt, floor, ceil. No other identifiers are accepted.',
    variables: [
      {
        name: 'passRateWindowDays',
        label: 'Pass-rate window',
        description: 'Days fed into passRate7d when computing this score.',
        kind: 'window',
        defaultValue: 7,
        min: 1,
        max: 90,
        unit: 'days',
      },
      {
        name: 'criticalSeverities',
        label: 'Critical severities',
        description:
          'Which severities count toward the critical-defect ratio used in the default expression.',
        kind: 'severitySet',
        defaultValue: ['CRITICAL'],
        enumOptions: [...DEFECT_SEVERITIES],
      },
      {
        name: 'openStatuses',
        label: 'Open defect statuses',
        kind: 'statusSet',
        defaultValue: ['OPEN', 'IN_PROGRESS', 'REOPENED'],
        enumOptions: [...DEFECT_STATUSES],
      },
    ],
  },
};

export const KPI_FORMULA_DEFINITION_LIST: FormulaDefinition[] = Object.values(
  KPI_FORMULA_DEFINITIONS,
);

/** Default parameter map for a metric, derived from the registry. */
export function defaultParameters(metric: KPIMetricKey): FormulaParameters {
  const def = KPI_FORMULA_DEFINITIONS[metric];
  const params: FormulaParameters = {};
  for (const v of def.variables) params[v.name] = clone(v.defaultValue);
  return params;
}

/** Merge a (possibly partial) override on top of registry defaults. */
export function resolveParameters(
  metric: KPIMetricKey,
  override: FormulaParameters | null | undefined,
): FormulaParameters {
  const merged = defaultParameters(metric);
  if (override) {
    for (const v of KPI_FORMULA_DEFINITIONS[metric].variables) {
      if (Object.prototype.hasOwnProperty.call(override, v.name)) {
        merged[v.name] = override[v.name];
      }
    }
  }
  return merged;
}

export function defaultExpression(metric: KPIMetricKey): string | null {
  return KPI_FORMULA_DEFINITIONS[metric].defaultExpression ?? null;
}

export function buildResolvedConfig(
  metric: KPIMetricKey,
  override: {
    parameters: FormulaParameters | null;
    expression: string | null;
    updatedAt: Date | null;
    updatedById: string | null;
  } | null,
): ResolvedFormulaConfig {
  return {
    metric,
    parameters: resolveParameters(metric, override?.parameters ?? null),
    expression: override?.expression ?? defaultExpression(metric),
    isCustomized: override !== null,
    updatedAt: override?.updatedAt ? override.updatedAt.toISOString() : null,
    updatedById: override?.updatedById ?? null,
  };
}

function clone<T>(v: T): T {
  if (Array.isArray(v)) return v.slice() as unknown as T;
  if (v && typeof v === 'object') return { ...(v as object) } as T;
  return v;
}
