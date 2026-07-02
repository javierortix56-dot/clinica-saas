import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../database/prisma.service';
import { RedisLockService } from '../queue/redis-lock.service';

interface HealthReport {
  status: 'ok';
  db: 'up';
  redis: 'up';
}

/**
 * Healthcheck para Railway (Settings → Health Check Path → /healthz).
 * Chequea las dos dependencias duras: Postgres (Prisma) y Redis (BullMQ/locks).
 * 200 = todo arriba; 503 = alguna caída (Railway reinicia/alerta).
 */
@SkipThrottle()
@Controller('healthz')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisLock: RedisLockService,
  ) {}

  @Get()
  async check(): Promise<HealthReport> {
    const [db, redis] = await Promise.all([this.checkDb(), this.redisLock.ping()]);
    if (!db || !redis) {
      throw new ServiceUnavailableException({
        status: 'error',
        db: db ? 'up' : 'down',
        redis: redis ? 'up' : 'down',
      });
    }
    return { status: 'ok', db: 'up', redis: 'up' };
  }

  private async checkDb(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
