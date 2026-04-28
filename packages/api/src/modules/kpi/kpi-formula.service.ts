import { BadRequestException, Injectable } from '@nestjs/common';
import { KPIMetric, Prisma } from '@prisma/client';
import { Parser } from 'expr-eval';
import {
  type FormulaParameters,
  type FormulaVariableSpec,
  type KPIMetricKey,
  type ResolvedFormulaConfig,
} from '@qod/shared';
import { PrismaService } from '../../database/prisma.service';
import {
  KPI_FORMULA_DEFINITIONS,
  buildResolvedConfig,
  defaultExpression,
  defaultParameters,
} from './kpi-formula.definitions';

// Math-only function whitelist for composite expressions. Anything else
// (e.g. an attempt to call `eval`, `process`, or an unknown identifier) is
// rejected at parse time.
const ALLOWED_EXPR_FUNCTIONS = new Set([
  'min',
  'max',
  'abs',
  'round',
  'floor',
  'ceil',
  'sqrt',
]);

@Injectable()
export class KPIFormulaService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(projectId: string, metric: KPIMetricKey): Promise<ResolvedFormulaConfig> {
    this.assertKnownMetric(metric);
    const row = await this.prisma.kPIFormulaConfig.findUnique({
      where: {
        projectId_metric: { projectId, metric: metric as KPIMetric },
      },
    });
    return this.toResolved(metric, row);
  }

  async resolveAll(projectId: string): Promise<Record<KPIMetricKey, ResolvedFormulaConfig>> {
    const rows = await this.prisma.kPIFormulaConfig.findMany({ where: { projectId } });
    const byMetric = new Map(rows.map((r) => [r.metric as KPIMetricKey, r]));
    const out = {} as Record<KPIMetricKey, ResolvedFormulaConfig>;
    for (const metric of Object.keys(KPI_FORMULA_DEFINITIONS) as KPIMetricKey[]) {
      out[metric] = this.toResolved(metric, byMetric.get(metric) ?? null);
    }
    return out;
  }

  async upsert(
    projectId: string,
    metric: KPIMetricKey,
    parameters: FormulaParameters,
    expression: string | null,
    userId: string | null,
  ): Promise<ResolvedFormulaConfig> {
    this.assertKnownMetric(metric);
    const merged = this.validateAndMerge(metric, parameters, expression);

    const row = await this.prisma.kPIFormulaConfig.upsert({
      where: {
        projectId_metric: { projectId, metric: metric as KPIMetric },
      },
      create: {
        projectId,
        metric: metric as KPIMetric,
        parameters: merged.parameters as Prisma.InputJsonValue,
        expression: merged.expression,
        updatedById: userId,
      },
      update: {
        parameters: merged.parameters as Prisma.InputJsonValue,
        expression: merged.expression,
        updatedById: userId,
      },
    });

    return this.toResolved(metric, row);
  }

  async reset(projectId: string, metric: KPIMetricKey): Promise<ResolvedFormulaConfig> {
    this.assertKnownMetric(metric);
    await this.prisma.kPIFormulaConfig.deleteMany({
      where: { projectId, metric: metric as KPIMetric },
    });
    return this.toResolved(metric, null);
  }

  /**
   * Most-recent override updatedAt per metric, restricted to the requested
   * window. Used by the dashboard to draw "formula changed" markers on the
   * sparkline.
   */
  async getFormulaChangePoints(
    projectId: string,
    sinceDays: number,
  ): Promise<Record<KPIMetricKey, string[]>> {
    const since = new Date();
    since.setDate(since.getDate() - sinceDays);

    const rows = await this.prisma.kPIFormulaConfig.findMany({
      where: { projectId, updatedAt: { gte: since } },
      select: { metric: true, updatedAt: true },
    });

    const out = {} as Record<KPIMetricKey, string[]>;
    for (const r of rows) {
      const key = r.metric as KPIMetricKey;
      (out[key] ||= []).push(r.updatedAt.toISOString());
    }
    return out;
  }

  /** Throws BadRequestException with a clear message if invalid. */
  validate(
    metric: KPIMetricKey,
    parameters: FormulaParameters,
    expression: string | null,
  ): void {
    this.validateAndMerge(metric, parameters, expression);
  }

  // ─── internals ──────────────────────────────────────────────────────

  private validateAndMerge(
    metric: KPIMetricKey,
    parameters: FormulaParameters,
    expression: string | null,
  ): { parameters: FormulaParameters; expression: string | null } {
    const def = KPI_FORMULA_DEFINITIONS[metric];

    // Reject unknown parameter keys to catch typos/poisoning early.
    const allowedNames = new Set(def.variables.map((v) => v.name));
    for (const key of Object.keys(parameters ?? {})) {
      if (!allowedNames.has(key)) {
        throw new BadRequestException(
          `Unknown parameter "${key}" for metric ${metric}`,
        );
      }
    }

    // Validate each provided parameter value.
    const merged: FormulaParameters = defaultParameters(metric);
    for (const v of def.variables) {
      if (!Object.prototype.hasOwnProperty.call(parameters ?? {}, v.name)) continue;
      const value = (parameters as Record<string, unknown>)[v.name];
      this.validateVariable(metric, v, value);
      merged[v.name] = value;
    }

    // Validate expression for composite KPIs.
    let expr: string | null = null;
    if (def.expressionEditable) {
      const candidate = expression ?? def.defaultExpression ?? null;
      if (candidate) this.validateExpression(metric, candidate);
      expr = candidate;
    } else if (expression && expression.trim()) {
      throw new BadRequestException(
        `Metric ${metric} does not support a custom expression`,
      );
    }

    return { parameters: merged, expression: expr };
  }

  private validateVariable(
    metric: KPIMetricKey,
    spec: FormulaVariableSpec,
    value: unknown,
  ): void {
    const fail = (msg: string): never => {
      throw new BadRequestException(`${metric}.${spec.name}: ${msg}`);
    };

    switch (spec.kind) {
      case 'window':
      case 'integer': {
        if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
          fail('expected an integer');
        }
        if (spec.min !== undefined && (value as number) < spec.min) fail(`must be ≥ ${spec.min}`);
        if (spec.max !== undefined && (value as number) > spec.max) fail(`must be ≤ ${spec.max}`);
        return;
      }
      case 'boolean': {
        if (typeof value !== 'boolean') fail('expected a boolean');
        return;
      }
      case 'enum': {
        if (typeof value !== 'string') fail('expected a string');
        if (!spec.enumOptions?.includes(value as string)) {
          fail(`must be one of ${spec.enumOptions?.join(', ')}`);
        }
        return;
      }
      case 'statusSet':
      case 'severitySet': {
        if (!Array.isArray(value)) fail('expected an array of strings');
        if ((value as unknown[]).length === 0) fail('must contain at least one value');
        for (const v of value as unknown[]) {
          if (typeof v !== 'string') fail('all entries must be strings');
          if (!spec.enumOptions?.includes(v as string)) {
            fail(`unknown value "${v}"; allowed: ${spec.enumOptions?.join(', ')}`);
          }
        }
        return;
      }
      case 'regex': {
        if (typeof value !== 'string') fail('expected a regex string');
        try {
          new RegExp(value as string);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'invalid regex';
          fail(msg);
        }
        return;
      }
      default: {
        const _exhaustive: never = spec.kind;
        void _exhaustive;
      }
    }
  }

  private validateExpression(metric: KPIMetricKey, expression: string): void {
    const def = KPI_FORMULA_DEFINITIONS[metric];
    const allowed = new Set(def.expressionVariables ?? []);

    let parsed;
    try {
      parsed = Parser.parse(expression);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'invalid expression';
      throw new BadRequestException(`Expression syntax error: ${msg}`);
    }

    for (const sym of parsed.symbols({ withMembers: false })) {
      if (allowed.has(sym)) continue;
      if (ALLOWED_EXPR_FUNCTIONS.has(sym)) continue;
      throw new BadRequestException(
        `Expression references unknown identifier "${sym}". Allowed: ${[...allowed].join(', ')} (functions: ${[...ALLOWED_EXPR_FUNCTIONS].join(', ')}).`,
      );
    }

    // Smoke-test evaluation with all variables bound to a neutral value to
    // catch operators that throw at runtime.
    const probe: Record<string, number> = {};
    for (const v of allowed) probe[v] = 50;
    try {
      const result = parsed.evaluate(probe);
      if (typeof result !== 'number' || !Number.isFinite(result)) {
        throw new BadRequestException('Expression must evaluate to a finite number');
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : 'expression evaluation failed';
      throw new BadRequestException(`Expression evaluation error: ${msg}`);
    }
  }

  private toResolved(
    metric: KPIMetricKey,
    row: { parameters: unknown; expression: string | null; updatedAt: Date; updatedById: string | null } | null,
  ): ResolvedFormulaConfig {
    if (!row) return buildResolvedConfig(metric, null);
    const params = (row.parameters && typeof row.parameters === 'object'
      ? (row.parameters as FormulaParameters)
      : {}) as FormulaParameters;
    return buildResolvedConfig(metric, {
      parameters: params,
      expression: row.expression ?? defaultExpression(metric),
      updatedAt: row.updatedAt,
      updatedById: row.updatedById,
    });
  }

  private assertKnownMetric(metric: string): asserts metric is KPIMetricKey {
    if (!(metric in KPI_FORMULA_DEFINITIONS)) {
      throw new BadRequestException(`Unknown KPI metric: ${metric}`);
    }
  }
}
