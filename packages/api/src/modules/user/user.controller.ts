import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  ForbiddenException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('api/v1/users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  findAll(@Req() req: any) {
    // Only return users from the caller's org
    const orgId = req.user?.orgId;
    return this.userService.findAll(orgId);
  }

  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: any,
  ) {
    // Only allow the same user or an ADMIN to update
    if (req.user?.userId !== id && req.user?.role !== 'ADMIN') {
      throw new ForbiddenException('You can only update your own profile');
    }
    return this.userService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    // Only allow ADMINs to delete users
    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Only administrators can delete users');
    }
    return this.userService.delete(id);
  }
}
