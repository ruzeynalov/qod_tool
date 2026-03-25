import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  BadRequestException,
  UseGuards,
  ParseUUIDPipe,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ExportService } from './export.service';
import { ProjectAccessGuard } from '../../common/guards/project-access.guard';

@UseGuards(ProjectAccessGuard)
@Controller('api/v1/projects/:projectId/export')
export class ExportController {
  private readonly logger = new Logger(ExportController.name);

  constructor(private readonly exportService: ExportService) {}

  @Get('csv')
  async exportCSV(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('type') type: string,
    @Res() reply: any,
  ) {
    if (!type) {
      throw new BadRequestException('Query parameter "type" is required');
    }

    try {
      const csv = await this.exportService.exportCSV(projectId, type);

      reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="${type}-${projectId}.csv"`)
        .send(csv);
    } catch (error) {
      this.logger.error(`CSV export failed for project ${projectId}: ${error}`);
      throw new InternalServerErrorException('CSV export failed');
    }
  }

  @Get('pdf')
  async exportPDF(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Res() reply: any,
  ) {
    try {
      const buffer = await this.exportService.generatePDFReport(projectId);

      reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="report-${projectId}.pdf"`)
        .send(buffer);
    } catch (error) {
      this.logger.error(`PDF export failed for project ${projectId}: ${error}`);
      throw new InternalServerErrorException('PDF export failed');
    }
  }

  @Get('summary')
  async exportSummary(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.exportService.exportProjectSummaryJSON(projectId);
  }
}
