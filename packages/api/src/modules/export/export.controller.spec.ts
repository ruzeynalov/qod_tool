import { BadRequestException } from '@nestjs/common';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

const PROJECT_ID = 'proj-uuid-1';

function createMockExportService() {
  return {
    exportCSV: vi.fn().mockResolvedValue('col1,col2\nval1,val2'),
    generatePDFReport: vi.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
    exportProjectSummaryJSON: vi.fn().mockResolvedValue({ projectId: PROJECT_ID, summary: {} }),
  };
}

function createMockReply() {
  const reply: any = {};
  reply.header = vi.fn().mockReturnValue(reply);
  reply.send = vi.fn().mockReturnValue(reply);
  return reply;
}

describe('ExportController', () => {
  let controller: ExportController;
  let service: ReturnType<typeof createMockExportService>;

  beforeEach(() => {
    service = createMockExportService();
    controller = new ExportController(service as unknown as ExportService);
  });

  it('exportCSV calls service and sets CSV headers on reply', async () => {
    const reply = createMockReply();
    await controller.exportCSV(PROJECT_ID, 'test-cases', reply);

    expect(service.exportCSV).toHaveBeenCalledWith(PROJECT_ID, 'test-cases');
    expect(reply.header).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(reply.header).toHaveBeenCalledWith(
      'Content-Disposition',
      `attachment; filename="test-cases-${PROJECT_ID}.csv"`,
    );
    expect(reply.send).toHaveBeenCalledWith('col1,col2\nval1,val2');
  });

  it('exportCSV throws BadRequestException when type is missing', async () => {
    const reply = createMockReply();
    await expect(controller.exportCSV(PROJECT_ID, undefined as any, reply))
      .rejects.toThrow(BadRequestException);
  });

  it('exportPDF calls service and sets PDF headers on reply', async () => {
    const reply = createMockReply();
    await controller.exportPDF(PROJECT_ID, reply);

    expect(service.generatePDFReport).toHaveBeenCalledWith(PROJECT_ID);
    expect(reply.header).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(reply.header).toHaveBeenCalledWith(
      'Content-Disposition',
      `attachment; filename="report-${PROJECT_ID}.pdf"`,
    );
    expect(reply.send).toHaveBeenCalledWith(expect.any(Buffer));
  });

  it('exportSummary calls service and returns JSON', async () => {
    const result = await controller.exportSummary(PROJECT_ID);
    expect(service.exportProjectSummaryJSON).toHaveBeenCalledWith(PROJECT_ID);
    expect(result).toEqual(expect.objectContaining({ projectId: PROJECT_ID }));
  });
});
