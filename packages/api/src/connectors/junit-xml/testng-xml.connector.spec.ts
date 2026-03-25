import { TestNGXMLConnector } from './testng-xml.connector';

describe('TestNGXMLConnector', () => {
  let connector: TestNGXMLConnector;

  beforeEach(() => {
    connector = new TestNGXMLConnector();
  });

  it('should have correct name and type', () => {
    expect(connector.name).toBe('testng-xml');
    expect(connector.type).toBe('report_upload');
  });

  it('should parse a standard TestNG XML report', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <testng-results>
      <suite name="Default Suite" duration-ms="5000">
        <test name="Regression" duration-ms="5000">
          <class name="com.app.PaymentTest">
            <test-method name="testPaymentSuccess" status="PASS" duration-ms="1200"/>
            <test-method name="testPaymentTimeout" status="FAIL" duration-ms="3000">
              <exception class="java.lang.AssertionError">
                <message><![CDATA[Expected success]]></message>
                <full-stacktrace><![CDATA[at PaymentTest.java:42]]></full-stacktrace>
              </exception>
            </test-method>
            <test-method name="testRefund" status="SKIP" duration-ms="0"/>
          </class>
        </test>
      </suite>
    </testng-results>`;

    const run = await connector.parseReport(xml);

    expect(run.results).toHaveLength(3);
    expect(run.status).toBe('FAILED');
    expect(run.triggerType).toBe('WEBHOOK');
    expect(run.durationMs).toBe(5000);
  });

  it('should map PASS to PASSED', async () => {
    const xml = `<testng-results>
      <suite name="S" duration-ms="100">
        <test name="T" duration-ms="100">
          <class name="com.Foo">
            <test-method name="testOk" status="PASS" duration-ms="100"/>
          </class>
        </test>
      </suite>
    </testng-results>`;

    const run = await connector.parseReport(xml);
    expect(run.results[0].status).toBe('PASSED');
  });

  it('should map FAIL to FAILED', async () => {
    const xml = `<testng-results>
      <suite name="S" duration-ms="200">
        <test name="T" duration-ms="200">
          <class name="com.Foo">
            <test-method name="testFail" status="FAIL" duration-ms="200">
              <exception class="java.lang.AssertionError">
                <message><![CDATA[bad value]]></message>
                <full-stacktrace><![CDATA[at Foo.java:10]]></full-stacktrace>
              </exception>
            </test-method>
          </class>
        </test>
      </suite>
    </testng-results>`;

    const run = await connector.parseReport(xml);
    expect(run.results[0].status).toBe('FAILED');
    expect(run.results[0].errorMessage).toBe('bad value');
    expect(run.results[0].stackTrace).toBe('at Foo.java:10');
  });

  it('should map SKIP to SKIPPED', async () => {
    const xml = `<testng-results>
      <suite name="S" duration-ms="0">
        <test name="T" duration-ms="0">
          <class name="com.Foo">
            <test-method name="testSkip" status="SKIP" duration-ms="0"/>
          </class>
        </test>
      </suite>
    </testng-results>`;

    const run = await connector.parseReport(xml);
    expect(run.results[0].status).toBe('SKIPPED');
  });

  it('should extract class name and suite name', async () => {
    const xml = `<testng-results>
      <suite name="MySuite" duration-ms="500">
        <test name="MyTest" duration-ms="500">
          <class name="com.app.CheckoutTest">
            <test-method name="testCheckout" status="PASS" duration-ms="500"/>
          </class>
        </test>
      </suite>
    </testng-results>`;

    const run = await connector.parseReport(xml);
    expect(run.results[0].testClassName).toBe('com.app.CheckoutTest');
    expect(run.results[0].testSuiteName).toBe('MySuite');
  });

  it('should handle duration-ms attribute correctly', async () => {
    const xml = `<testng-results>
      <suite name="S" duration-ms="3500">
        <test name="T" duration-ms="3500">
          <class name="com.Foo">
            <test-method name="testSlow" status="PASS" duration-ms="3500"/>
          </class>
        </test>
      </suite>
    </testng-results>`;

    const run = await connector.parseReport(xml);
    expect(run.results[0].durationMs).toBe(3500);
    expect(run.durationMs).toBe(3500);
  });

  it('should handle multiple suites', async () => {
    const xml = `<testng-results>
      <suite name="Suite1" duration-ms="1000">
        <test name="T1" duration-ms="1000">
          <class name="com.A">
            <test-method name="test1" status="PASS" duration-ms="1000"/>
          </class>
        </test>
      </suite>
      <suite name="Suite2" duration-ms="2000">
        <test name="T2" duration-ms="2000">
          <class name="com.B">
            <test-method name="test2" status="PASS" duration-ms="2000"/>
          </class>
        </test>
      </suite>
    </testng-results>`;

    const run = await connector.parseReport(xml);
    expect(run.results).toHaveLength(2);
    expect(run.results[0].testSuiteName).toBe('Suite1');
    expect(run.results[1].testSuiteName).toBe('Suite2');
    expect(run.durationMs).toBe(3000);
  });

  it('should handle multiple classes within a test', async () => {
    const xml = `<testng-results>
      <suite name="S" duration-ms="500">
        <test name="T" duration-ms="500">
          <class name="com.A">
            <test-method name="test1" status="PASS" duration-ms="200"/>
          </class>
          <class name="com.B">
            <test-method name="test2" status="PASS" duration-ms="300"/>
          </class>
        </test>
      </suite>
    </testng-results>`;

    const run = await connector.parseReport(xml);
    expect(run.results).toHaveLength(2);
    expect(run.results[0].testClassName).toBe('com.A');
    expect(run.results[1].testClassName).toBe('com.B');
  });

  it('should handle multiple tests within a suite', async () => {
    const xml = `<testng-results>
      <suite name="S" duration-ms="1000">
        <test name="T1" duration-ms="500">
          <class name="com.A">
            <test-method name="test1" status="PASS" duration-ms="500"/>
          </class>
        </test>
        <test name="T2" duration-ms="500">
          <class name="com.B">
            <test-method name="test2" status="FAIL" duration-ms="500">
              <exception class="java.lang.Error">
                <message><![CDATA[oops]]></message>
                <full-stacktrace><![CDATA[at B.java:5]]></full-stacktrace>
              </exception>
            </test-method>
          </class>
        </test>
      </suite>
    </testng-results>`;

    const run = await connector.parseReport(xml);
    expect(run.results).toHaveLength(2);
    expect(run.status).toBe('FAILED');
  });

  it('should set run status to PASSED when all tests pass', async () => {
    const xml = `<testng-results>
      <suite name="S" duration-ms="100">
        <test name="T" duration-ms="100">
          <class name="com.Foo">
            <test-method name="test1" status="PASS" duration-ms="50"/>
            <test-method name="test2" status="PASS" duration-ms="50"/>
          </class>
        </test>
      </suite>
    </testng-results>`;

    const run = await connector.parseReport(xml);
    expect(run.status).toBe('PASSED');
  });

  it('should generate unique testExternalId', async () => {
    const xml = `<testng-results>
      <suite name="S" duration-ms="200">
        <test name="T" duration-ms="200">
          <class name="com.A">
            <test-method name="test1" status="PASS" duration-ms="100"/>
          </class>
          <class name="com.B">
            <test-method name="test1" status="PASS" duration-ms="100"/>
          </class>
        </test>
      </suite>
    </testng-results>`;

    const run = await connector.parseReport(xml);
    expect(run.results[0].testExternalId).toBe('com.A#test1');
    expect(run.results[1].testExternalId).toBe('com.B#test1');
    expect(run.results[0].testExternalId).not.toBe(run.results[1].testExternalId);
  });

  it('should handle empty suite', async () => {
    const xml = `<testng-results>
      <suite name="Empty" duration-ms="0">
        <test name="T" duration-ms="0">
        </test>
      </suite>
    </testng-results>`;

    const run = await connector.parseReport(xml);
    expect(run.results).toHaveLength(0);
    expect(run.status).toBe('PASSED');
  });

  it('should filter out config methods (is-config=true)', async () => {
    const xml = `<testng-results>
      <suite name="S" duration-ms="500">
        <test name="T" duration-ms="500">
          <class name="com.Foo">
            <test-method name="setUp" status="PASS" duration-ms="100" is-config="true"/>
            <test-method name="testReal" status="PASS" duration-ms="400"/>
          </class>
        </test>
      </suite>
    </testng-results>`;

    const run = await connector.parseReport(xml);
    expect(run.results).toHaveLength(1);
    expect(run.results[0].testTitle).toBe('testReal');
  });
});
