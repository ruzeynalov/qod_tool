import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';

const ORG_ID = 'org-uuid-1';
const PROJECT_ID = 'proj-uuid-1';

function createMockProjectService() {
  return {
    findAll: vi.fn().mockResolvedValue([{ id: PROJECT_ID, name: 'My Project' }]),
    findAllForUser: vi.fn().mockResolvedValue([{ id: PROJECT_ID, name: 'My Project' }]),
    findById: vi.fn().mockResolvedValue({ id: PROJECT_ID, name: 'My Project', orgId: ORG_ID }),
    isMember: vi.fn().mockResolvedValue({ projectId: PROJECT_ID, userId: 'u1', role: 'MEMBER' }),
    create: vi.fn().mockResolvedValue({ id: PROJECT_ID, name: 'New Project' }),
    update: vi.fn().mockResolvedValue({ id: PROJECT_ID, name: 'Updated' }),
    delete: vi.fn().mockResolvedValue({ id: PROJECT_ID }),
  };
}

describe('ProjectController', () => {
  let controller: ProjectController;
  let service: ReturnType<typeof createMockProjectService>;

  beforeEach(() => {
    service = createMockProjectService();
    controller = new ProjectController(service as unknown as ProjectService);
  });

  it('findAll passes orgId to service', async () => {
    const req = { user: { role: 'ADMIN', orgId: ORG_ID } };
    const result = await controller.findAll(ORG_ID, req);
    expect(service.findAll).toHaveBeenCalledWith(ORG_ID);
    expect(result).toHaveLength(1);
  });

  it('findAll scopes non-admin users to their org and membership', async () => {
    const req = { user: { role: 'MEMBER', orgId: 'user-org', userId: 'u1' } };
    await controller.findAll(ORG_ID, req);
    expect(service.findAllForUser).toHaveBeenCalledWith('user-org', 'u1');
  });

  it('findById passes id to service', async () => {
    const req = { user: { role: 'ADMIN', orgId: ORG_ID } };
    const result = await controller.findById(PROJECT_ID, req);
    expect(service.findById).toHaveBeenCalledWith(PROJECT_ID);
    expect(result).toEqual(expect.objectContaining({ id: PROJECT_ID }));
  });

  it('findById throws ForbiddenException for non-admin accessing another org project', async () => {
    const req = { user: { role: 'MEMBER', orgId: 'other-org' } };
    await expect(controller.findById(PROJECT_ID, req)).rejects.toThrow('Access denied to this project');
  });

  it('create passes orgId and dto to service', async () => {
    const dto = { name: 'New Project', description: 'A test project' };
    const result = await controller.create(ORG_ID, dto);
    expect(service.create).toHaveBeenCalledWith(ORG_ID, dto);
    expect(result).toEqual(expect.objectContaining({ name: 'New Project' }));
  });

  it('update passes id and dto to service', async () => {
    const dto = { name: 'Updated', retentionDays: 90 };
    const req = { user: { role: 'ADMIN', orgId: ORG_ID } };
    const result = await controller.update(PROJECT_ID, dto, req);
    expect(service.update).toHaveBeenCalledWith(PROJECT_ID, dto);
    expect(result).toEqual(expect.objectContaining({ name: 'Updated' }));
  });

  it('delete passes id to service', async () => {
    const req = { user: { role: 'ADMIN', orgId: ORG_ID } };
    const result = await controller.delete(PROJECT_ID, req);
    expect(service.delete).toHaveBeenCalledWith(PROJECT_ID);
    expect(result).toEqual(expect.objectContaining({ id: PROJECT_ID }));
  });
});
