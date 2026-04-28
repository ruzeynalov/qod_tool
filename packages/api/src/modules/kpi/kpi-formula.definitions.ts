// The KPI formula registry lives in @qod/shared so the API and the web
// client (for demo-mode previews and dynamic UI) share a single source of
// truth. This file re-exports the public symbols for ergonomic imports.

export {
  KPI_FORMULA_DEFINITIONS,
  KPI_FORMULA_DEFINITION_LIST,
  buildResolvedConfig,
  defaultExpression,
  defaultParameters,
  resolveParameters,
} from '@qod/shared';
