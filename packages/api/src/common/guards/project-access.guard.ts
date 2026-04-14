import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const { projectId } = request.params;

    if (!projectId) {
      return true;
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { orgId: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const user = request.user;
    if (!user) {
      return true; // Let AuthGuard handle this
    }

    if (user.role === 'ADMIN') {
      return true;
    }

    if (project.orgId !== user.orgId) {
      throw new ForbiddenException('Access denied to this project');
    }

    // Check ProjectMember membership for non-ADMIN users
    const membership = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId, userId: user.userId },
      },
    });

    if (!membership) {
      throw new ForbiddenException('You do not have access to this project');
    }

    return true;
  }
}
