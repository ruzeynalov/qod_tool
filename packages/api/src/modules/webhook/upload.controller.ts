import {
  Controller,
  Post,
  Param,
  Body,
  Logger,
  HttpCode,
  BadRequestException,
  PayloadTooLargeException,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JUnitXMLConnector } from '../../connectors/junit-xml/junit-xml.connector';
import { TestNGXMLConnector } from '../../connectors/junit-xml/testng-xml.connector';
import { SyncService } from '../sync/sync.service';
import { ProjectAccessGuard } from '../../common/guards/project-access.guard';
import type { NormalizedTestRun } from '@qod/shared';

const MAX_XML_SIZE = 10 * 1024 * 1024; // 10 MB

@UseGuards(ProjectAccessGuard)
@Controller('api/v1/projects/:projectId/upload')
export class UploadController {
  private readonly logger = new Logger(UploadController.name);
  private readonly junitConnector = new JUnitXMLConnector();
  private readonly testngConnector = new TestNGXMLConnector();

  constructor(private readonly syncService: SyncService) {}

  @Post('junit-xml')
  @HttpCode(200)
  async uploadJUnitXML(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() body: string,
  ) {
    return this.handleUpload(projectId, body, this.junitConnector, 'junit-xml');
  }

  @Post('testng-xml')
  @HttpCode(200)
  async uploadTestNGXML(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() body: string,
  ) {
    return this.handleUpload(projectId, body, this.testngConnector, 'testng-xml');
  }

  private async handleUpload(
    projectId: string,
    xmlContent: string,
    connector: { parseReport(xml: string): Promise<NormalizedTestRun> },
    source: string,
  ) {
    // Reject payloads larger than 10 MB
    const sizeBytes = typeof xmlContent === 'string'
      ? Buffer.byteLength(xmlContent, 'utf8')
      : 0;
    if (sizeBytes > MAX_XML_SIZE) {
      throw new PayloadTooLargeException(`XML payload exceeds maximum size of ${MAX_XML_SIZE / (1024 * 1024)} MB`);
    }

    let run: NormalizedTestRun;

    try {
      run = await connector.parseReport(xmlContent);
    } catch (error) {
      this.logger.error(`Failed to parse ${source} XML: ${error}`);
      throw new BadRequestException(
        `Invalid ${source} XML: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await this.syncService.syncTestRuns(projectId, '', [run], source);

    const totalTests = run.results.length;
    const passed = run.results.filter((r) => r.status === 'PASSED').length;
    const failed = run.results.filter(
      (r) => r.status === 'FAILED' || r.status === 'ERROR',
    ).length;
    const skipped = run.results.filter((r) => r.status === 'SKIPPED').length;

    return {
      success: true,
      run: {
        totalTests,
        passed,
        failed,
        skipped,
        status: run.status,
      },
    };
  }
}
