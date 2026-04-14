import { Injectable } from '@nestjs/common';
import { GlobalRole, ProjectRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

const USER_SELECT = {
  id: true,
  email: true,
  username: true,
  name: true,
  role: true,
  orgId: true,
  avatarUrl: true,
  blockedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findAll(orgId: string) {
    return this.prisma.user.findMany({ where: { orgId }, select: USER_SELECT });
  }

  async create(data: {
    orgId: string;
    email: string;
    username: string;
    name: string;
    role?: string;
    passwordHash: string;
  }) {
    return this.prisma.user.create({
      data: {
        orgId: data.orgId,
        email: data.email,
        username: data.username,
        name: data.name,
        role: (data.role as GlobalRole) ?? GlobalRole.MEMBER,
        password: data.passwordHash,
      },
      select: USER_SELECT,
    });
  }


  async update(id: string, dto: UpdateUserDto) {
    const { role, ...rest } = dto;
    return this.prisma.user.update({
      where: { id },
      data: {
        ...rest,
        ...(role ? { role: role as GlobalRole } : {}),
      },
      select: USER_SELECT,
    });
  }

  async updateWithRole(id: string, dto: { name?: string; username?: string; email?: string; role?: string }) {
    const { role, ...rest } = dto;
    return this.prisma.user.update({
      where: { id },
      data: {
        ...rest,
        ...(role ? { role: role as GlobalRole } : {}),
      },
      select: USER_SELECT,
    });
  }

  async block(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { blockedAt: new Date() },
      select: USER_SELECT,
    });
  }

  async unblock(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { blockedAt: null },
      select: USER_SELECT,
    });
  }

  async updatePassword(id: string, hashedPassword: string) {
    return this.prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
      select: USER_SELECT,
    });
  }

  async getUserProjects(userId: string) {
    return this.prisma.projectMember.findMany({
      where: { userId },
      include: {
        project: {
          select: { id: true, name: true, slug: true },
        },
      },
    });
  }

  async setProjectAccess(userId: string, projectId: string, role: string) {
    return this.prisma.projectMember.upsert({
      where: {
        projectId_userId: { projectId, userId },
      },
      create: {
        userId,
        projectId,
        role: role as ProjectRole,
      },
      update: {
        role: role as ProjectRole,
      },
    });
  }

  async removeProjectAccess(userId: string, projectId: string) {
    return this.prisma.projectMember.delete({
      where: {
        projectId_userId: { projectId, userId },
      },
    });
  }

  async delete(id: string) {
    return this.prisma.user.delete({ where: { id }, select: USER_SELECT });
  }
}
