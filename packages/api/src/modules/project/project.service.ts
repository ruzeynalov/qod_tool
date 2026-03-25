import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectService {
  constructor(private readonly prisma: PrismaService) {}

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  async create(orgId: string | undefined, dto: CreateProjectDto) {
    // Validate orgId exists; fall back to first org or create one
    if (orgId) {
      const orgExists = await this.prisma.organization.findUnique({ where: { id: orgId } });
      if (!orgExists) orgId = undefined;
    }
    if (!orgId) {
      let defaultOrg = await this.prisma.organization.findFirst();
      if (!defaultOrg) {
        defaultOrg = await this.prisma.organization.create({
          data: { name: 'Default Organization', slug: 'default' },
        });
      }
      orgId = defaultOrg.id;
    }

    const slug = this.generateSlug(dto.name);

    const existing = await this.prisma.project.findFirst({
      where: { orgId, slug, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException(`A project named "${dto.name}" already exists`);
    }

    return this.prisma.project.create({
      data: {
        orgId,
        name: dto.name,
        slug,
        description: dto.description,
        demoMode: dto.demoMode ?? false,
      },
    });
  }

  async findAll(orgId?: string) {
    return this.prisma.project.findMany({
      where: {
        ...(orgId ? { orgId } : {}),
        deletedAt: null,
      },
      include: {
        _count: {
          select: { members: true },
        },
      },
    });
  }

  async findById(id: string) {
    return this.prisma.project.findFirst({
      where: { id, deletedAt: null },
      include: {
        connectorConfigs: true,
        featureAreas: true,
        kpiTargets: true,
      },
    });
  }

  async update(id: string, dto: UpdateProjectDto) {
    return this.prisma.project.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: string) {
    // Append a unique suffix to the slug so the original name can be reused
    const now = new Date();
    const suffix = `_deleted_${now.getTime()}`;
    const project = await this.prisma.project.findUnique({ where: { id }, select: { slug: true } });
    return this.prisma.project.update({
      where: { id },
      data: {
        deletedAt: now,
        slug: project ? `${project.slug}${suffix}` : `deleted_${id}`,
      },
    });
  }

  async findBySlug(orgId: string, slug: string) {
    return this.prisma.project.findUnique({
      where: {
        orgId_slug: { orgId, slug },
      },
    });
  }
}
