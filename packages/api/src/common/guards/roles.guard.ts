import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PrismaService } from '../../database/prisma.service';

/**
 * Guard that checks whether the current user has one of the required roles.
 *
 * It checks in order:
 *   1. The user's global role (from the JWT / request.user.role).
 *   2. If a `projectId` route param is present, the user's project-level role
 *      (from the ProjectMember table).
 *
 * Access is granted when **any** of the user's roles matches at least one of
 * the roles specified via the @Roles() decorator.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no roles are required, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    // Check global role first
    if (user.role && requiredRoles.includes(user.role)) {
      return true;
    }

    // Check project-level role if projectId is available
    const projectId = request.params?.projectId;
    if (projectId && user.userId) {
      const membership = await this.prisma.projectMember.findFirst({
        where: { projectId, userId: user.userId },
        select: { role: true },
      });

      if (membership && requiredRoles.includes(membership.role)) {
        return true;
      }
    }

    return false;
  }
}
