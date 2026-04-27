import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { NotificationService } from './notification.service';

@Controller('api/v1/notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  getNotifications(@Req() req: any) {
    return this.notificationService.getNotifications(req.user.userId);
  }

  @Get('unread-count')
  async getUnreadCount(@Req() req: any) {
    const count = await this.notificationService.getUnreadCount(req.user.userId);
    return { count };
  }

  @Get('log')
  getLog(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('projectId') projectId?: string,
    @Query('metrics') metrics?: string,
  ) {
    return this.notificationService.getLog(req.user.userId, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      search,
      projectId,
      metrics: metrics ? metrics.split(',').filter(Boolean) : undefined,
    });
  }

  @Patch(':id/read')
  markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    return this.notificationService.markAsRead(id, req.user.userId);
  }

  @Post('read-all')
  markAllAsRead(@Req() req: any) {
    return this.notificationService.markAllAsRead(req.user.userId);
  }

  @Post(':id/mute')
  mute(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    return this.notificationService.mute(id, req.user.userId);
  }

  @Post(':id/unmute')
  unmute(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    return this.notificationService.unmute(id, req.user.userId);
  }
}
