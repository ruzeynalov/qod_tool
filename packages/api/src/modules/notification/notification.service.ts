import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

interface LogQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  projectId?: string;
  metrics?: string[];
}

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async getNotifications(userId: string, limit = 50) {
    // Bell dropdown: hide muted notifications so the user's "current
    // alerts" view isn't polluted. The Alert Log still includes them.
    return this.prisma.notification.findMany({
      where: { userId, muted: false },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getUnreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, read: false, muted: false },
    });
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    return this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  async getLog(userId: string, query: LogQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.NotificationWhereInput = { userId };

    if (query.projectId) {
      where.projectId = query.projectId;
    }
    if (query.search && query.search.trim().length > 0) {
      const term = query.search.trim();
      const or: Prisma.NotificationWhereInput[] = [
        { title: { contains: term, mode: 'insensitive' } },
        { body: { contains: term, mode: 'insensitive' } },
      ];
      // Also match notifications whose linked alert rule uses a metric
      // whose human label matches the search (mapped by the client).
      if (query.metrics && query.metrics.length > 0) {
        or.push({ alertRule: { metric: { in: query.metrics as any[] } } });
      }
      where.OR = or;
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          project: { select: { id: true, name: true } },
          alertRule: {
            select: { id: true, metric: true, condition: true, threshold: true, enabled: true },
          },
        },
      }),
    ]);

    return { items, total, page, pageSize };
  }

  async mute(id: string, userId: string) {
    return this.setMuted(id, userId, true);
  }

  async unmute(id: string, userId: string) {
    return this.setMuted(id, userId, false);
  }

  private async setMuted(id: string, userId: string, muted: boolean) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    return this.prisma.notification.update({
      where: { id },
      data: { muted },
    });
  }
}
