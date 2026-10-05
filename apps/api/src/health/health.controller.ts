import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async health() {
    const checks = { database: 'unknown', redis: 'unknown' };

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
    }

    try {
      const pong = await this.redis.ping();
      checks.redis = pong === 'PONG' ? 'ok' : 'error';
    } catch {
      checks.redis = 'error';
    }

    const healthy = checks.database === 'ok' && checks.redis === 'ok';
    const payload = {
      status: healthy ? 'ok' : 'error',
      ...checks,
      timestamp: new Date().toISOString(),
    };

    if (!healthy) throw new ServiceUnavailableException(payload);
    return payload;
  }
}
