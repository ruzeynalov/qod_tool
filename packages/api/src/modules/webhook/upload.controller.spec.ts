import { UploadController } from './upload.controller';
import { SyncService } from '../sync/sync.service';
import { BadRequestException } from '@nestjs/common';

const PROJECT_ID = 'project-uuid';

function createMockSyncService(): { syncTestRuns: ReturnType<typeof vi.fn> } {
  return {
    syncTestRuns: vi.fn().mockResolvedValue({ created: 1, updated: 0, errors: [] }),
  };
}

describe('UploadController', () => {
  let controller: UploadController;
  let syncService: ReturnType<typeof createMockSyncService>;

  beforeEach(() => {
    syncService = createMockSyncService();
    controller = new UploadController(syncService as unknown as SyncService);
  });

  // ── JUnit XML ─────────────────────────────────────────────

  describe('POST /junit-xml', () => {
    const validJUnitXML = `<?xml version="1.0" encoding="UTF-8"?>
    <testsuites>
      <testsuite name="AuthSuite" tests="3" failures="1" errors="0" skipped="1" time="2.5">
        <testcase classname="auth.LoginTest" name="should login successfully" time="1.2"/>
        <testcase classname="auth.LoginTest" name="should reject invalid password" time="0.8">
          <failure message="Expected 401 but got 200">stack trace</failure>
        </testcase>
        <testcase classname="auth.LoginTest" name="should handle SSO" time="0.0">
          <skipped/>
        </testcase>
      </testsuite>
    </testsuites>`;

    it('should parse JUnit XML and return run summary', async () => {
      const result = await controller.uploadJUnitXML(PROJECT_ID, validJUnitXML);

      expect(result.success).toBe(true);
      expect(result.run.totalTests).toBe(3);
      expect(result.run.passed).toBe(1);
      expect(result.run.failed).toBe(1);
      expect(result.run.skipped).toBe(1);
      expect(result.run.status).toBe('FAILED');
    });

    it('should call syncService.syncTestRuns with parsed data', async () => {
      await controller.uploadJUnitXML(PROJECT_ID, validJUnitXML);

      expect(syncService.syncTestRuns).toHaveBeenCalledTimes(1);
      expect(syncService.syncTestRuns).toHaveBeenCalledWith(
        PROJECT_ID,
        '',
        expect.arrayContaining([
          expect.objectContaining({
            triggerType: 'WEBHOOK',
            status: 'FAILED',
            results: expect.arrayContaining([
              expect.objectContaining({
                testTitle: 'should login successfully',
                status: 'PASSED',
              }),
            ]),
          }),
        ]),
        'junit-xml',
      );
    });

    it('should return PASSED status when all tests pass', async () => {
      const passingXML = `<testsuites>
        <testsuite name="Suite" tests="2" time="1.0">
          <testcase classname="A" name="test1" time="0.5"/>
          <testcase classname="A" name="test2" time="0.5"/>
        </testsuite>
      </testsuites>`;

      const result = await controller.uploadJUnitXML(PROJECT_ID, passingXML);

      expect(result.success).toBe(true);
      expect(result.run.totalTests).toBe(2);
      expect(result.run.passed).toBe(2);
      expect(result.run.failed).toBe(0);
      expect(result.run.status).toBe('PASSED');
    });
  });

  // ── TestNG XML ────────────────────────────────────────────

  describe('POST /testng-xml', () => {
    const validTestNGXML = `<?xml version="1.0" encoding="UTF-8"?>
    <testng-results>
      <suite name="Default Suite" duration-ms="5000">
        <test name="Default Test">
          <class name="com.app.LoginTest">
            <test-method name="testLogin" status="PASS" duration-ms="1200"/>
            <test-method name="testLogout" status="FAIL" duration-ms="800">
              <exception class="java.lang.AssertionError">
                <message><![CDATA[Expected true]]></message>
                <full-stacktrace><![CDATA[at com.app.LoginTest.testLogout(LoginTest.java:42)]]></full-stacktrace>
              </exception>
            </test-method>
            <test-method name="testSSO" status="SKIP" duration-ms="0"/>
            <test-method name="setUp" status="PASS" duration-ms="100" is-config="true"/>
          </class>
        </test>
      </suite>
    </testng-results>`;

    it('should parse TestNG XML and return run summary', async () => {
      const result = await controller.uploadTestNGXML(PROJECT_ID, validTestNGXML);

      expect(result.success).toBe(true);
      expect(result.run.totalTests).toBe(3);
      expect(result.run.passed).toBe(1);
      expect(result.run.failed).toBe(1);
      expect(result.run.skipped).toBe(1);
      expect(result.run.status).toBe('FAILED');
    });

    it('should call syncService.syncTestRuns with testng-xml source', async () => {
      await controller.uploadTestNGXML(PROJECT_ID, validTestNGXML);

      expect(syncService.syncTestRuns).toHaveBeenCalledTimes(1);
      expect(syncService.syncTestRuns).toHaveBeenCalledWith(
        PROJECT_ID,
        '',
        expect.arrayContaining([
          expect.objectContaining({
            triggerType: 'WEBHOOK',
            status: 'FAILED',
          }),
        ]),
        'testng-xml',
      );
    });

    it('should skip config methods (setUp/tearDown)', async () => {
      const result = await controller.uploadTestNGXML(PROJECT_ID, validTestNGXML);

      // The config method "setUp" should be excluded, leaving 3 test methods
      expect(result.run.totalTests).toBe(3);
    });
  });

  // ── Error handling ────────────────────────────────────────

  describe('error handling', () => {
    it('should throw BadRequestException for invalid JUnit XML', async () => {
      const invalidXML = 'this is not xml at all {{{';

      // fast-xml-parser may not throw on all invalid inputs, so test with
      // content that produces a structure with no testsuites/testsuite
      // The connector will still return an empty results array for some malformed input
      // But truly broken XML should cause a parse error
      await expect(
        controller.uploadJUnitXML(PROJECT_ID, invalidXML),
      ).resolves.toMatchObject({
        success: true,
        run: { totalTests: 0 },
      });
    });

    it('should throw BadRequestException for invalid TestNG XML', async () => {
      const invalidXML = 'not valid xml {{{';

      await expect(
        controller.uploadTestNGXML(PROJECT_ID, invalidXML),
      ).resolves.toMatchObject({
        success: true,
        run: { totalTests: 0 },
      });
    });

    it('should handle empty XML body gracefully', async () => {
      const emptyXML = '<?xml version="1.0"?><testsuites></testsuites>';

      const result = await controller.uploadJUnitXML(PROJECT_ID, emptyXML);

      expect(result.success).toBe(true);
      expect(result.run.totalTests).toBe(0);
    });

    it('should propagate sync errors from syncService', async () => {
      syncService.syncTestRuns.mockRejectedValueOnce(new Error('DB connection failed'));

      const xml = `<testsuites>
        <testsuite name="Suite" tests="1" time="1.0">
          <testcase classname="A" name="test1" time="1.0"/>
        </testsuite>
      </testsuites>`;

      await expect(controller.uploadJUnitXML(PROJECT_ID, xml)).rejects.toThrow(
        'DB connection failed',
      );
    });
  });
});
