import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  ParseUUIDPipe,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ProjectService } from './project.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AuditAction } from '../../common/interceptors/audit-log.interceptor';

@Controller('api/v1/projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get()
  findAll(@Query('orgId') orgId: string, @Req() req: any) {
    // Non-admin users can only see projects in their org
    const effectiveOrgId = req.user?.role === 'ADMIN' ? orgId : (req.user?.orgId ?? orgId);
    return this.projectService.findAll(effectiveOrgId);
  }

  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    await this.verifyProjectAccess(id, req);
    return this.projectService.findById(id);
  }

  @Post()
  @AuditAction({ action: 'project.created', entityType: 'Project' })
  create(
    @Query('orgId') orgId: string,
    @Body() dto: CreateProjectDto,
    @Req() req: any,
  ) {
    // Use orgId from query, or fall back to authenticated user's orgId
    const effectiveOrgId = orgId || req.user?.orgId;
    return this.projectService.create(effectiveOrgId, dto);
  }

  @Patch(':id')
  @AuditAction({ action: 'project.updated', entityType: 'Project' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProjectDto, @Req() req: any) {
    await this.verifyProjectAccess(id, req);
    return this.projectService.update(id, dto);
  }

  @Delete(':id')
  @AuditAction({ action: 'project.deleted', entityType: 'Project' })
  async delete(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    await this.verifyProjectAccess(id, req);
    return this.projectService.delete(id);
  }

  private async verifyProjectAccess(projectId: string, req: any) {
    const project = await this.projectService.findById(projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    const user = req.user;
    if (!user) return;
    if (user.role === 'ADMIN') return;
    if (project.orgId !== user.orgId) {
      throw new ForbiddenException('Access denied to this project');
    }
  }
}
