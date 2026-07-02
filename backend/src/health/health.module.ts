import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

// PrismaService y RedisLockService llegan por los módulos @Global
// (DatabaseModule / QueueModule); acá solo se registra el controller.
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
