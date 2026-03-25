import { XMLParser } from 'fast-xml-parser';
import type {
  IReportUploadConnector,
  NormalizedTestRun,
  NormalizedTestResult,
} from '@qod/shared';

export class JUnitXMLConnector implements IReportUploadConnector {
  readonly name = 'junit-xml';
  readonly type = 'report_upload' as const;

  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
  });

  async parseReport(xmlContent: string): Promise<NormalizedTestRun> {
    const parsed = this.parser.parse(xmlContent);

    const testsuites = this.extractTestSuites(parsed);
    const results: NormalizedTestResult[] = [];
    let totalDurationMs = 0;

    for (const suite of testsuites) {
      const suiteName = (suite['@_name'] as string) ?? '';
      const suiteTimeMs = Math.round((parseFloat((suite['@_time'] as string) || '0')) * 1000);
      totalDurationMs += suiteTimeMs;

      const testcases = this.toArray(suite.testcase);

      for (const tc of testcases) {
        results.push(this.mapTestCase(tc, suiteName));
      }
    }

    const hasFailed = results.some(
      (r) => r.status === 'FAILED' || r.status === 'ERROR',
    );

    return {
      externalId: `junit-${Date.now()}`,
      triggerType: 'WEBHOOK',
      startedAt: new Date(),
      durationMs: totalDurationMs,
      status: hasFailed ? 'FAILED' : 'PASSED',
      results,
    };
  }

  private extractTestSuites(parsed: Record<string, unknown>): Record<string, unknown>[] {
    if (parsed.testsuites) {
      const wrapper = parsed.testsuites as Record<string, unknown>;
      return this.toArray(wrapper.testsuite);
    }
    if (parsed.testsuite) {
      return this.toArray(parsed.testsuite);
    }
    return [];
  }

  private mapTestCase(
    tc: Record<string, unknown>,
    suiteName: string,
  ): NormalizedTestResult {
    const name = (tc['@_name'] as string) ?? '';
    const classname = (tc['@_classname'] as string) ?? '';
    const timeSeconds = parseFloat((tc['@_time'] as string) || '0');
    const durationMs = Math.round(timeSeconds * 1000);

    let status: NormalizedTestResult['status'] = 'PASSED';
    let errorMessage: string | undefined;
    let stackTrace: string | undefined;

    if (tc.failure) {
      status = 'FAILED';
      const failure = this.firstOrSelf(tc.failure);
      errorMessage = (failure as Record<string, unknown>)['@_message'] as string | undefined;
      stackTrace = this.extractText(failure);
    } else if (tc.error) {
      status = 'ERROR';
      const error = this.firstOrSelf(tc.error);
      errorMessage = (error as Record<string, unknown>)['@_message'] as string | undefined;
      stackTrace = this.extractText(error);
    } else if (tc.skipped !== undefined) {
      status = 'SKIPPED';
    }

    return {
      testExternalId: classname ? `${classname}#${name}` : name,
      testTitle: name,
      testClassName: classname || undefined,
      testSuiteName: suiteName || undefined,
      status,
      durationMs,
      errorMessage,
      stackTrace,
    };
  }

  private extractText(node: unknown): string | undefined {
    if (typeof node === 'string') return node.trim() || undefined;
    if (node && typeof node === 'object') {
      const text = (node as Record<string, unknown>)['#text'];
      if (typeof text === 'string') return text.trim() || undefined;
    }
    return undefined;
  }

  private firstOrSelf(value: unknown): unknown {
    return Array.isArray(value) ? value[0] : value;
  }

  private toArray<T = Record<string, unknown>>(value: unknown): T[] {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : [value as T];
  }
}
