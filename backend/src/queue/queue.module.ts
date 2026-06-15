import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import IORedis from 'ioredis';
import { WHATSAPP_INCOMING_QUEUE } from './queue.constants';
import { RedisLockService } from './redis-lock.service';

/**
 * QueueModule (blueprint Paso 6 §2): conexión BullMQ a Redis + la cola
 * `whatsapp-incoming` + el mutex por conversación (`RedisLockService`).
 *
 * Global: la cola (productor) y el lock quedan disponibles en toda la app sin
 * re-importar. `BullModule` se re-exporta para que los `@Processor` de otros
 * módulos se registren contra esta cola.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // BullMQ exige maxRetriesPerRequest: null para sus conexiones de worker.
        connection: new IORedis(config.getOrThrow<string>('REDIS_URL'), {
          maxRetriesPerRequest: null,
        }),
      }),
    }),
    BullModule.registerQueue({ name: WHATSAPP_INCOMING_QUEUE }),
  ],
  providers: [RedisLockService],
  exports: [BullModule, RedisLockService],
})
export class QueueModule {}
