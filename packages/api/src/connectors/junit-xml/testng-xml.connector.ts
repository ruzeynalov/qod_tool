import { XMLParser } from 'fast-xml-parser';
import type {
  IReportUploadConnector,
  NormalizedTestRun,
  NormalizedTestResult,
} from '@qod/shared';

const STATUS_MAP: Record<string, NormalizedTestResult['status']> = {
  PASS: 'PASSED',
  FAIL: 'FAILED',
  SKIP: 'SKIPPED',
};

export class TestNGXMLConnector implements IReportUploadConnector {
  readonly name = 'testng-xml';
  readonly type = 'report_upload' as const;

  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    cdataPropName: '__cdata',
  });

  async parseReport(xmlContent: string): Promise<NormalizedTestRun> {
    const parsed = this.parser.parse(xmlContent);
    const root = parsed['testng-results'];

    const suites = this.toArray(root?.suite);
    const results: NormalizedTestResult[] = [];
    let totalDurationMs = 0;

    for (const suite of suites) {
      const suiteName = (suite['@_name'] as string) ?? '';
      const suiteDuration = parseInt((suite['@_duration-ms'] as string) || '0', 10);
      totalDurationMs += suiteDuration;

      const tests = this.toArray(suite.test);

      for (const test of tests) {
        const classes = this.toArray(test.class);

        for (const cls of classes) {
          const className = (cls['@_name'] as string) ?? '';
          const methods = this.toArray(cls['test-method']);

          for (const method of methods) {
            // Skip config methods (setUp, tearDown, etc.)
            if (method['@_is-config'] === 'true') continue;

            results.push(this.mapTestMethod(method, className, suiteName));
          }
        }
      }
    }

    const hasFailed = results.some((r) => r.status === 'FAILED');

    return {
      externalId: `testng-${Date.now()}`,
      triggerType: 'WEBHOOK',
      startedAt: new Date(),
      durationMs: totalDurationMs,
      status: hasFailed ? 'FAILED' : 'PASSED',
      results,
    };
  }

  private mapTestMethod(
    method: Record<string, unknown>,
    className: string,
    suiteName: string,
  ): NormalizedTestResult {
    const name = (method['@_name'] as string) ?? '';
    const rawStatus = (method['@_status'] as string) ?? 'PASS';
    const durationMs = parseInt((method['@_duration-ms'] as string) || '0', 10);

    const status = STATUS_MAP[rawStatus] ?? 'PASSED';

    let errorMessage: string | undefined;
    let stackTrace: string | undefined;

    const exception = method.exception as Record<string, unknown> | undefined;
    if (exception) {
      errorMessage = this.extractCdataText(exception.message);
      stackTrace = this.extractCdataText(exception['full-stacktrace']);
    }

    return {
      testExternalId: className ? `${className}#${name}` : name,
      testTitle: name,
      testClassName: className || undefined,
      testSuiteName: suiteName || undefined,
      status,
      durationMs,
      errorMessage,
      stackTrace,
    };
  }

  private extractCdataText(node: unknown): string | undefined {
    if (node === undefined || node === null) return undefined;
    if (typeof node === 'string') return node.trim() || undefined;
    if (typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      // fast-xml-parser with cdataPropName stores CDATA in __cdata
      if (obj.__cdata !== undefined) {
        return typeof obj.__cdata === 'string' ? obj.__cdata.trim() || undefined : undefined;
      }
      if (obj['#text'] !== undefined) {
        return typeof obj['#text'] === 'string' ? (obj['#text'] as string).trim() || undefined : undefined;
      }
    }
    return undefined;
  }

  private toArray<T = Record<string, unknown>>(value: unknown): T[] {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : [value as T];
  }
}
