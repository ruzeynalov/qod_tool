import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Body,
  Req,
  ForbiddenException,
  ParseUUIDPipe,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { UserService } from './user.service';
import { AuthService } from '../auth/auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller('api/v1/users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  findAll(@Req() req: any) {
    const orgId = req.user?.orgId;
    return this.userService.findAll(orgId);
  }

  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.findById(id);
  }

  @Post()
  async create(@Body() dto: CreateUserDto, @Req() req: any) {
    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Only administrators can create users');
    }

    const plainPassword = dto.password ?? crypto.randomBytes(12).toString('base64url');
    const passwordHash = await this.authService.hashPassword(plainPassword);

    const user = await this.userService.create({
      orgId: req.user.orgId,
      email: dto.email,
      username: dto.username,
      name: dto.name,
      role: dto.role,
      passwordHash,
    });

    return { ...user, password: plainPassword };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: any,
  ) {
    // If updating role, email, or username — must be ADMIN and not self-demotion
    if (dto.role || dto.email || dto.username) {
      if (req.user?.role !== 'ADMIN') {
        throw new ForbiddenException('Only administrators can change user roles');
      }
      if (req.user?.userId === id && dto.role && dto.role !== 'ADMIN') {
        throw new ForbiddenException('Cannot demote yourself');
      }
      return this.userService.updateWithRole(id, dto);
    }

    // Regular update — self or admin
    if (req.user?.userId !== id && req.user?.role !== 'ADMIN') {
      throw new ForbiddenException('You can only update your own profile');
    }
    return this.userService.update(id, dto);
  }

  @Post('me/change-password')
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: any,
  ) {
    const user = await this.userService.findByEmail(req.user?.email);
    if (!user || !user.password) {
      throw new ForbiddenException('Cannot change password');
    }
    const isValid = await this.authService.verifyPassword(dto.currentPassword, user.password);
    if (!isValid) {
      throw new ForbiddenException('Current password is incorrect');
    }
    const hashedPassword = await this.authService.hashPassword(dto.newPassword);
    await this.userService.updatePassword(req.user.userId, hashedPassword);
    return { message: 'Password changed successfully' };
  }

  @Post(':id/block')
  async block(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Only administrators can block users');
    }
    if (req.user?.userId === id) {
      throw new ForbiddenException('Cannot block yourself');
    }
    return this.userService.block(id);
  }

  @Post(':id/unblock')
  async unblock(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Only administrators can unblock users');
    }
    return this.userService.unblock(id);
  }

  @Post(':id/regenerate-password')
  async regeneratePassword(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Only administrators can regenerate passwords');
    }

    const plainPassword = crypto.randomBytes(12).toString('base64url');
    const hashedPassword = await this.authService.hashPassword(plainPassword);
    await this.userService.updatePassword(id, hashedPassword);

    return { password: plainPassword };
  }

  @Get(':id/projects')
  getUserProjects(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    if (req.user?.userId !== id && req.user?.role !== 'ADMIN') {
      throw new ForbiddenException('You can only view your own project access');
    }
    return this.userService.getUserProjects(id);
  }

  @Put(':id/projects/:projectId')
  async setProjectAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() body: { role: string },
    @Req() req: any,
  ) {
    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Only administrators can manage project access');
    }
    return this.userService.setProjectAccess(id, projectId, body.role);
  }

  @Delete(':id/projects/:projectId')
  async removeProjectAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Req() req: any,
  ) {
    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Only administrators can manage project access');
    }
    return this.userService.removeProjectAccess(id, projectId);
  }

  @Delete(':id')
  async delete(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Only administrators can delete users');
    }
    if (req.user?.userId === id) {
      throw new ForbiddenException('Cannot delete yourself');
    }
    return this.userService.delete(id);
  }
}
