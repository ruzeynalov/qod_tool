import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  orgId: true,
  avatarUrl: true,
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

  async update(id: string, dto: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: USER_SELECT,
    });
  }

  async delete(id: string) {
    return this.prisma.user.delete({ where: { id }, select: USER_SELECT });
  }
}
