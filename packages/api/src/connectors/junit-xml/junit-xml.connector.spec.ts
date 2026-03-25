import { JUnitXMLConnector } from './junit-xml.connector';
import type { NormalizedTestRun } from '@qod/shared';

describe('JUnitXMLConnector', () => {
  let connector: JUnitXMLConnector;

  beforeEach(() => {
    connector = new JUnitXMLConnector();
  });

  it('should have correct name and type', () => {
    expect(connector.name).toBe('junit-xml');
    expect(connector.type).toBe('report_upload');
  });

  it('should parse a standard JUnit XML report', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <testsuites>
      <testsuite name="AuthSuite" tests="3" failures="1" errors="0" skipped="1" time="2.5">
        <testcase classname="auth.LoginTest" name="should login successfully" time="1.2"/>
        <testcase classname="auth.LoginTest" name="should reject invalid password" time="0.8">
          <failure message="Expected 401 but got 200" type="AssertionError">
            at LoginTest.test (login.test.ts:15)
          </failure>
        </testcase>
        <testcase classname="auth.LoginTest" name="should handle SSO" time="0.0">
          <skipped message="SSO not configured"/>
        </testcase>
      </testsuite>
    </testsuites>`;

    const run = await connector.parseReport(xml);

    expect(run.results).toHaveLength(3);
    expect(run.status).toBe('FAILED');
    expect(run.triggerType).toBe('WEBHOOK');
    expect(run.durationMs).toBe(2500);
  });

  it('should map PASSED status when testcase has no child element', async () => {
    const xml = `<testsuites>
      <testsuite name="Suite" tests="1" time="1.0">
        <testcase classname="com.Foo" name="testBar" time="1.0"/>
      </testsuite>
    </testsuites>`;

    const run = await connector.parseReport(xml);
    expect(run.results[0].status).toBe('PASSED');
  });

  it('should map FAILED status from <failure> element', async () => {
    const xml = `<testsuites>
      <testsuite name="Suite" tests="1" time="0.5">
        <testcase classname="com.Foo" name="testFail" time="0.5">
          <failure message="assertion failed" type="AssertionError">stack trace here</failure>
        </testcase>
      </testsuite>
    </testsuites>`;

    const run = await connector.parseReport(xml);
    expect(run.results[0].status).toBe('FAILED');
    expect(run.results[0].errorMessage).toBe('assertion failed');
    expect(run.results[0].stackTrace).toBe('stack trace here');
  });

  it('should map ERROR status from <error> element', async () => {
    const xml = `<testsuites>
      <testsuite name="Suite" tests="1" time="0.3">
        <testcase classname="com.Foo" name="testError" time="0.3">
          <error message="NullPointerException" type="java.lang.NullPointerException">at Foo.java:10</error>
        </testcase>
      </testsuite>
    </testsuites>`;

    const run = await connector.parseReport(xml);
    expect(run.results[0].status).toBe('ERROR');
    expect(run.results[0].errorMessage).toBe('NullPointerException');
    expect(run.results[0].stackTrace).toBe('at Foo.java:10');
  });

  it('should map SKIPPED status from <skipped> element', async () => {
    const xml = `<testsuites>
      <testsuite name="Suite" tests="1" time="0.0">
        <testcase classname="com.Foo" name="testSkip" time="0.0">
          <skipped message="not ready"/>
        </testcase>
      </testsuite>
    </testsuites>`;

    const run = await connector.parseReport(xml);
    expect(run.results[0].status).toBe('SKIPPED');
  });

  it('should extract className and suiteName', async () => {
    const xml = `<testsuites>
      <testsuite name="MySuite" tests="1" time="1.0">
        <testcase classname="com.app.MyClass" name="testSomething" time="1.0"/>
      </testsuite>
    </testsuites>`;

    const run = await connector.parseReport(xml);
    expect(run.results[0].testClassName).toBe('com.app.MyClass');
    expect(run.results[0].testSuiteName).toBe('MySuite');
  });

  it('should calculate total duration from all testsuites', async () => {
    const xml = `<testsuites>
      <testsuite name="Suite1" tests="1" time="1.5">
        <testcase classname="A" name="test1" time="1.5"/>
      </testsuite>
      <testsuite name="Suite2" tests="1" time="2.5">
        <testcase classname="B" name="test2" time="2.5"/>
      </testsuite>
    </testsuites>`;

    const run = await connector.parseReport(xml);
    expect(run.results).toHaveLength(2);
    expect(run.durationMs).toBe(4000);
  });

  it('should handle multiple testsuites', async () => {
    const xml = `<testsuites>
      <testsuite name="Suite1" tests="2" time="1.0">
        <testcase classname="A" name="test1" time="0.5"/>
        <testcase classname="A" name="test2" time="0.5"/>
      </testsuite>
      <testsuite name="Suite2" tests="1" time="0.3">
        <testcase classname="B" name="test3" time="0.3"/>
      </testsuite>
    </testsuites>`;

    const run = await connector.parseReport(xml);
    expect(run.results).toHaveLength(3);
    expect(run.results[0].testSuiteName).toBe('Suite1');
    expect(run.results[2].testSuiteName).toBe('Suite2');
  });

  it('should handle single testsuite without testsuites wrapper', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <testsuite name="SingleSuite" tests="1" time="0.7">
      <testcase classname="com.Foo" name="testOne" time="0.7"/>
    </testsuite>`;

    const run = await connector.parseReport(xml);
    expect(run.results).toHaveLength(1);
    expect(run.results[0].testTitle).toBe('testOne');
    expect(run.results[0].testSuiteName).toBe('SingleSuite');
    expect(run.durationMs).toBe(700);
  });

  it('should set run status to PASSED when no tests failed', async () => {
    const xml = `<testsuites>
      <testsuite name="Suite" tests="2" time="1.0">
        <testcase classname="A" name="test1" time="0.5"/>
        <testcase classname="A" name="test2" time="0.5">
          <skipped/>
        </testcase>
      </testsuite>
    </testsuites>`;

    const run = await connector.parseReport(xml);
    expect(run.status).toBe('PASSED');
  });

  it('should set run status to FAILED if any test failed', async () => {
    const xml = `<testsuites>
      <testsuite name="Suite" tests="2" time="1.0">
        <testcase classname="A" name="test1" time="0.5"/>
        <testcase classname="A" name="test2" time="0.5">
          <failure message="fail"/>
        </testcase>
      </testsuite>
    </testsuites>`;

    const run = await connector.parseReport(xml);
    expect(run.status).toBe('FAILED');
  });

  it('should set run status to FAILED if any test errored', async () => {
    const xml = `<testsuites>
      <testsuite name="Suite" tests="1" time="0.5">
        <testcase classname="A" name="test1" time="0.5">
          <error message="crash"/>
        </testcase>
      </testsuite>
    </testsuites>`;

    const run = await connector.parseReport(xml);
    expect(run.status).toBe('FAILED');
  });

  it('should handle empty testsuites', async () => {
    const xml = `<testsuites>
      <testsuite name="EmptySuite" tests="0" time="0.0">
      </testsuite>
    </testsuites>`;

    const run = await connector.parseReport(xml);
    expect(run.results).toHaveLength(0);
    expect(run.status).toBe('PASSED');
    expect(run.durationMs).toBe(0);
  });

  it('should parse error messages and stack traces from failure element', async () => {
    const xml = `<testsuites>
      <testsuite name="Suite" tests="1" time="1.0">
        <testcase classname="com.Foo" name="testFail" time="1.0">
          <failure message="Expected true but got false" type="AssertionError">
            org.junit.AssertionError: Expected true but got false
              at com.Foo.testFail(Foo.java:42)
              at sun.reflect.NativeMethodAccessorImpl.invoke(NativeMethodAccessorImpl.java:62)
          </failure>
        </testcase>
      </testsuite>
    </testsuites>`;

    const run = await connector.parseReport(xml);
    const result = run.results[0];
    expect(result.errorMessage).toBe('Expected true but got false');
    expect(result.stackTrace).toContain('com.Foo.testFail(Foo.java:42)');
  });

  it('should parse error messages and stack traces from error element', async () => {
    const xml = `<testsuites>
      <testsuite name="Suite" tests="1" time="0.1">
        <testcase classname="com.Bar" name="testCrash" time="0.1">
          <error message="Connection refused" type="java.io.IOException">
            java.io.IOException: Connection refused
              at com.Bar.testCrash(Bar.java:20)
          </error>
        </testcase>
      </testsuite>
    </testsuites>`;

    const run = await connector.parseReport(xml);
    const result = run.results[0];
    expect(result.errorMessage).toBe('Connection refused');
    expect(result.stackTrace).toContain('com.Bar.testCrash(Bar.java:20)');
  });

  it('should generate unique testExternalId from classname and name', async () => {
    const xml = `<testsuites>
      <testsuite name="Suite" tests="2" time="1.0">
        <testcase classname="com.Foo" name="testA" time="0.5"/>
        <testcase classname="com.Bar" name="testA" time="0.5"/>
      </testsuite>
    </testsuites>`;

    const run = await connector.parseReport(xml);
    expect(run.results[0].testExternalId).not.toBe(run.results[1].testExternalId);
    expect(run.results[0].testExternalId).toBe('com.Foo#testA');
    expect(run.results[1].testExternalId).toBe('com.Bar#testA');
  });

  it('should set startedAt to current time', async () => {
    const xml = `<testsuites>
      <testsuite name="Suite" tests="0" time="0"/>
    </testsuites>`;

    const before = new Date();
    const run = await connector.parseReport(xml);
    const after = new Date();

    expect(run.startedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(run.startedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should handle testsuite with single testcase (not wrapped in array)', async () => {
    const xml = `<testsuites>
      <testsuite name="Solo" tests="1" time="0.1">
        <testcase classname="X" name="only" time="0.1"/>
      </testsuite>
    </testsuites>`;

    const run = await connector.parseReport(xml);
    expect(run.results).toHaveLength(1);
    expect(run.results[0].testTitle).toBe('only');
  });
});
