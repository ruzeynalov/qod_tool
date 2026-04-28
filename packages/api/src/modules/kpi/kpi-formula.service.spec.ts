import { BadRequestException } from '@nestjs/common';
import { createPrismaMock, PrismaMock } from '../../common/utils/prisma-mock';
import { PrismaService } from '../../database/prisma.service';
import { KPIFormulaService } from './kpi-formula.service';

const projectId = 'proj-uuid-1';

describe('KPIFormulaService', () => {
  let service: KPIFormulaService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new KPIFormulaService(prisma as unknown as PrismaService);
  });

  describe('resolve()', () => {
    it('returns registry defaults when no override exists', async () => {
      prisma.kPIFormulaConfig.findUnique.mockResolvedValue(null);

      const resolved = await service.resolve(projectId, 'PASS_RATE_7D');

      expect(resolved.metric).toBe('PASS_RATE_7D');
      expect(resolved.parameters).toEqual({ windowDays: 7 });
      expect(resolved.expression).toBe('100 * passedResults / totalResults');
      expect(resolved.isCustomized).toBe(false);
    });

    it('merges override on top of defaults', async () => {
      prisma.kPIFormulaConfig.findUnique.mockResolvedValue({
        parameters: { windowDays: 14 },
        expression: '100 * (passedResults + flakyResults) / totalResults',
        updatedAt: new Date('2026-04-27T00:00:00Z'),
        updatedById: 'user-1',
      });

      const resolved = await service.resolve(projectId, 'PASS_RATE_7D');

      expect(resolved.parameters.windowDays).toBe(14);
      expect(resolved.expression).toBe('100 * (passedResults + flakyResults) / totalResults');
      expect(resolved.isCustomized).toBe(true);
      expect(resolved.updatedAt).toBe('2026-04-27T00:00:00.000Z');
    });

    it('rejects unknown metrics', async () => {
      await expect(service.resolve(projectId, 'NOT_A_METRIC' as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('resolveAll()', () => {
    it('returns one entry per registry metric, customized flag set per row', async () => {
      prisma.kPIFormulaConfig.findMany.mockResolvedValue([
        {
          metric: 'PASS_RATE_7D',
          parameters: { windowDays: 14 },
          expression: null,
          updatedAt: new Date('2026-04-27'),
          updatedById: null,
        },
      ]);

      const all = await service.resolveAll(projectId);

      expect(Object.keys(all)).toHaveLength(11);
      expect(all.PASS_RATE_7D.isCustomized).toBe(true);
      expect(all.COVERAGE_PCT.isCustomized).toBe(false);
    });
  });

  describe('validate()', () => {
    it('rejects unknown parameter keys (typo guard)', () => {
      expect(() =>
        service.validate('PASS_RATE_7D', { windowDay: 7 } as any, null),
      ).toThrow(/Unknown parameter "windowDay"/);
    });

    it('rejects out-of-range integer values', () => {
      expect(() =>
        service.validate('PASS_RATE_7D', { windowDays: -1 }, null),
      ).toThrow(/must be ≥ 1/);
    });

    it('rejects unknown statusSet values', () => {
      expect(() =>
        service.validate('DEFECT_DENSITY', { openStatuses: ['NOT_A_STATUS'] }, null),
      ).toThrow(/unknown value "NOT_A_STATUS"/);
    });

    it('rejects empty statusSet', () => {
      expect(() =>
        service.validate('DEFECT_DENSITY', { openStatuses: [] }, null),
      ).toThrow(/at least one value/);
    });

    it('accepts a valid regex', () => {
      expect(() =>
        service.validate('REQ_COVERAGE', { referencePattern: '[A-Z]+-\\d+' }, null),
      ).not.toThrow();
    });

    it('rejects an invalid regex', () => {
      expect(() =>
        service.validate('REQ_COVERAGE', { referencePattern: '[unclosed' }, null),
      ).toThrow();
    });

    it('accepts custom expressions on previously-atomic metrics', () => {
      expect(() =>
        service.validate(
          'PASS_RATE_7D',
          { windowDays: 7 },
          '100 * (passedResults + flakyResults) / totalResults',
        ),
      ).not.toThrow();
    });

    it('rejects atomic-metric expressions that reference variables from another metric', () => {
      expect(() =>
        service.validate('PASS_RATE_7D', { windowDays: 7 }, 'criticalRatio'),
      ).toThrow(/unknown identifier "criticalRatio"/);
    });

    it('rejects expressions referencing unknown identifiers', () => {
      expect(() =>
        service.validate('READINESS_SCORE', {}, '0.5 * passRate7d + 0.5 * mystery'),
      ).toThrow(/unknown identifier "mystery"/);
    });

    it('rejects expressions calling non-whitelisted functions', () => {
      expect(() =>
        service.validate('READINESS_SCORE', {}, 'Math.random() + passRate7d'),
      ).toThrow();
    });

    it('accepts the default expression', () => {
      expect(() =>
        service.validate(
          'READINESS_SCORE',
          {},
          '0.4 * passRate7d + 0.3 * coverage + 0.3 * (100 - criticalRatio)',
        ),
      ).not.toThrow();
    });

    it('accepts whitelisted functions in expressions', () => {
      expect(() =>
        service.validate('READINESS_SCORE', {}, 'min(100, max(0, passRate7d))'),
      ).not.toThrow();
    });
  });

  describe('upsert()', () => {
    it('persists merged parameters and validated expression', async () => {
      prisma.kPIFormulaConfig.upsert.mockResolvedValue({
        parameters: { windowDays: 14 },
        expression: '100 * passedResults / totalResults',
        updatedAt: new Date('2026-04-27'),
        updatedById: 'user-1',
      });

      await service.upsert(
        projectId,
        'PASS_RATE_7D',
        { windowDays: 14 },
        '100 * passedResults / totalResults',
        'user-1',
      );

      const args = prisma.kPIFormulaConfig.upsert.mock.calls[0][0];
      expect(args.where.projectId_metric.metric).toBe('PASS_RATE_7D');
      expect(args.create.parameters).toEqual({ windowDays: 14 });
      expect(args.create.expression).toBe('100 * passedResults / totalResults');
      expect(args.create.updatedById).toBe('user-1');
    });
  });

  describe('reset()', () => {
    it('deletes the override row and returns registry defaults', async () => {
      prisma.kPIFormulaConfig.deleteMany.mockResolvedValue({ count: 1 });
      const resolved = await service.reset(projectId, 'COVERAGE_PCT');
      expect(prisma.kPIFormulaConfig.deleteMany).toHaveBeenCalledWith({
        where: { projectId, metric: 'COVERAGE_PCT' },
      });
      expect(resolved.isCustomized).toBe(false);
      expect(resolved.parameters).toEqual({});
      expect(resolved.expression).toBe('100 * automatedCount / totalTestCases');
    });
  });

  describe('getFormulaChangePoints()', () => {
    it('groups rows by metric and returns ISO timestamps', async () => {
      prisma.kPIFormulaConfig.findMany.mockResolvedValue([
        { metric: 'PASS_RATE_7D', updatedAt: new Date('2026-04-27T08:00:00Z') },
        { metric: 'COVERAGE_PCT', updatedAt: new Date('2026-04-26T15:30:00Z') },
        { metric: 'PASS_RATE_7D', updatedAt: new Date('2026-04-25T12:00:00Z') },
      ]);

      const points = await service.getFormulaChangePoints(projectId, 30);

      expect(points.PASS_RATE_7D).toEqual([
        '2026-04-27T08:00:00.000Z',
        '2026-04-25T12:00:00.000Z',
      ]);
      expect(points.COVERAGE_PCT).toEqual(['2026-04-26T15:30:00.000Z']);
    });
  });
});
