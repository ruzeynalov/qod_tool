import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorResult,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../database/prisma.service';
import Redis from 'ioredis';

@Public()
@Controller('api/v1/health')
export class HealthController {
  private readonly redisClient: Redis;

  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const redisUrl = this.configService.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    this.redisClient = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
    });
  }

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma),
      // D19/A12: Redis health indicator
      async (): Promise<HealthIndicatorResult> => {
        try {
          const result = await this.redisClient.ping();
          if (result === 'PONG') {
            return { redis: { status: 'up' } };
          }
          throw new Error(`Unexpected PING response: ${result}`);
        } catch (error) {
          throw new Error(`Redis health check failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
    ]);
  }
}
