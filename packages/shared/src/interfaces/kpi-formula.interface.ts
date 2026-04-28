// Shared types for the per-project, per-metric KPI formula configurator.
//
// The runtime registry (with defaults + validation) lives in the API package
// at packages/api/src/modules/kpi/kpi-formula.definitions.ts. Only the
// public-facing types live here so the web client can render the editor
// without duplicating type declarations.

export type KPIMetricKey =
  | 'COVERAGE_PCT'
  | 'PASS_RATE_7D'
  | 'PASS_RATE_30D'
  | 'FLAKY_RATE'
  | 'MTTD_HOURS'
  | 'MTTR_HOURS'
  | 'ESCAPE_RATE'
  | 'EXEC_VELOCITY'
  | 'REQ_COVERAGE'
  | 'READINESS_SCORE'
  | 'DEFECT_DENSITY';

export type FormulaCategory = 'testing' | 'defect' | 'composite';

export type FormulaDirection = 'higher' | 'lower';

export type FormulaVariableKind =
  | 'window' // integer days
  | 'integer' // bounded integer (e.g. minTransitions)
  | 'statusSet' // multi-select chips over a string enum
  | 'severitySet'
  | 'enum' // single-select dropdown
  | 'regex'
  | 'boolean';

export interface FormulaVariableSpec {
  name: string; // parameter key, e.g. "windowDays"
  label: string; // UI label
  description?: string;
  kind: FormulaVariableKind;
  defaultValue: unknown;
  enumOptions?: string[]; // for kind = enum / statusSet / severitySet
  min?: number; // for window / integer
  max?: number;
  unit?: string; // displayed suffix, e.g. "days"
}

export interface FormulaDefinition {
  metric: KPIMetricKey;
  category: FormulaCategory;
  label: string;
  description: string;
  /**
   * Read-only, human-readable form of the canonical formula. For atomic KPIs
   * it always renders this; for composite KPIs the editor shows the live
   * `expression` field instead and this string is a fallback.
   */
  formulaText: string;
  direction: FormulaDirection;
  unit: string;
  variables: FormulaVariableSpec[];
  /** Composite KPIs allow rewriting the math expression. */
  expressionEditable: boolean;
  /** When `expressionEditable`, these are the names exposed to the parser. */
  expressionVariables?: string[];
  /** Default expression (only when `expressionEditable`). */
  defaultExpression?: string;
  /** Long-form note rendered under the editor when present. */
  howItWorks?: string;
}

export type FormulaParameters = Record<string, unknown>;

export interface ResolvedFormulaConfig {
  metric: KPIMetricKey;
  parameters: FormulaParameters;
  expression: string | null;
  /** True when the project has overridden the registry default. */
  isCustomized: boolean;
  updatedAt: string | null;
  updatedById: string | null;
}

export interface FormulaPreviewResult {
  metric: KPIMetricKey;
  value: number;
  hasData: boolean;
  /** Optional intermediate values for transparency, e.g. { passed: 312, total: 341 }. */
  breakdown?: Record<string, number>;
}
