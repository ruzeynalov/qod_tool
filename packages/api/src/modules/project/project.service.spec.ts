import { createPrismaMock, PrismaMock } from '../../common/utils/prisma-mock';
import { ProjectService } from './project.service';
import { PrismaService } from '../../database/prisma.service';

describe('ProjectService', () => {
  let service: ProjectService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new ProjectService(prisma as unknown as PrismaService);
  });

  describe('create()', () => {
    const validOrg = { id: 'org-uuid-1', name: 'Test Org', slug: 'test-org' };

    beforeEach(() => {
      // Default mocks for org validation and duplicate check
      prisma.organization.findUnique.mockResolvedValue(validOrg);
      prisma.organization.findFirst.mockResolvedValue(validOrg);
      prisma.project.findFirst.mockResolvedValue(null); // no duplicate
    });

    it('should create a project with orgId, name, slug, and description', async () => {
      const orgId = 'org-uuid-1';
      const dto = { name: 'My Project', description: 'A test project' };
      const expected = {
        id: 'proj-uuid-1',
        orgId,
        name: dto.name,
        slug: 'my-project',
        description: dto.description,
        settings: {},
        retentionDays: 365,
        demoMode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.project.create.mockResolvedValue(expected);

      const result = await service.create(orgId, dto);

      expect(prisma.organization.findUnique).toHaveBeenCalledWith({ where: { id: orgId } });
      expect(prisma.project.findFirst).toHaveBeenCalledWith({
        where: { orgId, slug: 'my-project', deletedAt: null },
      });
      expect(prisma.project.create).toHaveBeenCalledWith({
        data: {
          orgId,
          name: dto.name,
          slug: 'my-project',
          description: dto.description,
          demoMode: false,
        },
      });
      expect(result).toEqual(expected);
    });

    it('should generate a slug from the name (lowercase, hyphenated)', async () => {
      const orgId = 'org-uuid-1';
      const dto = { name: 'My Awesome Project!!!' };

      prisma.project.create.mockResolvedValue({ id: 'proj-uuid-2' });

      await service.create(orgId, dto);

      expect(prisma.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slug: 'my-awesome-project',
          }),
        }),
      );
    });

    it('should handle names with special characters for slug generation', async () => {
      const orgId = 'org-uuid-1';
      const dto = { name: '---Hello World---' };

      prisma.project.create.mockResolvedValue({ id: 'proj-uuid-3' });

      await service.create(orgId, dto);

      expect(prisma.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slug: 'hello-world',
          }),
        }),
      );
    });

    it('should pass demoMode when provided', async () => {
      const orgId = 'org-uuid-1';
      const dto = { name: 'Demo Project', demoMode: true };

      prisma.project.create.mockResolvedValue({ id: 'proj-uuid-4' });

      await service.create(orgId, dto);

      expect(prisma.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            demoMode: true,
          }),
        }),
      );
    });
  });

  describe('findAll()', () => {
    it('should return all projects for an org with member count', async () => {
      const orgId = 'org-uuid-1';
      const projects = [
        { id: 'proj-1', orgId, name: 'Project 1', _count: { members: 3 } },
        { id: 'proj-2', orgId, name: 'Project 2', _count: { members: 1 } },
      ];

      prisma.project.findMany.mockResolvedValue(projects);

      const result = await service.findAll(orgId);

      expect(prisma.project.findMany).toHaveBeenCalledWith({
        where: { orgId, deletedAt: null },
        include: {
          _count: {
            select: { members: true },
          },
        },
      });
      expect(result).toEqual(projects);
    });
  });

  describe('findById()', () => {
    it('should return a project with connectorConfigs, featureAreas, and kpiTargets', async () => {
      const projectId = 'proj-uuid-1';
      const project = {
        id: projectId,
        name: 'My Project',
        connectorConfigs: [],
        featureAreas: [],
        kpiTargets: [],
      };

      prisma.project.findFirst.mockResolvedValue(project);

      const result = await service.findById(projectId);

      expect(prisma.project.findFirst).toHaveBeenCalledWith({
        where: { id: projectId, deletedAt: null },
        include: {
          connectorConfigs: true,
          featureAreas: true,
          kpiTargets: true,
        },
      });
      expect(result).toEqual(project);
    });
  });

  describe('update()', () => {
    it('should update project fields', async () => {
      const projectId = 'proj-uuid-1';
      const dto = { name: 'Updated Name', retentionDays: 90 };
      const updated = { id: projectId, ...dto };

      prisma.project.update.mockResolvedValue(updated);

      const result = await service.update(projectId, dto);

      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: projectId },
        data: dto,
      });
      expect(result).toEqual(updated);
    });
  });

  describe('delete()', () => {
    it('should soft-delete a project by setting deletedAt and appending suffix to slug', async () => {
      const projectId = 'proj-uuid-1';
      const existingProject = { slug: 'my-project' };
      const deleted = { id: projectId, name: 'Deleted Project', deletedAt: new Date() };

      prisma.project.findUnique.mockResolvedValue(existingProject);
      prisma.project.update.mockResolvedValue(deleted);

      const result = await service.delete(projectId);

      expect(prisma.project.findUnique).toHaveBeenCalledWith({
        where: { id: projectId },
        select: { slug: true },
      });
      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: projectId },
        data: {
          deletedAt: expect.any(Date),
          slug: expect.stringContaining('my-project_deleted_'),
        },
      });
      expect(result).toEqual(deleted);
    });
  });

  describe('findBySlug()', () => {
    it('should find a project by slug within an org', async () => {
      const orgId = 'org-uuid-1';
      const slug = 'my-project';
      const project = { id: 'proj-uuid-1', orgId, slug, name: 'My Project' };

      prisma.project.findUnique.mockResolvedValue(project);

      const result = await service.findBySlug(orgId, slug);

      expect(prisma.project.findUnique).toHaveBeenCalledWith({
        where: {
          orgId_slug: { orgId, slug },
        },
      });
      expect(result).toEqual(project);
    });
  });
});
