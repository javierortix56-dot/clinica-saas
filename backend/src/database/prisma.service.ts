import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Cliente Prisma como provider inyectable. Gestiona conexión/desconexión con
 * el ciclo de vida de Nest.
 *
 * TODO (paso 2 del blueprint): helper de contexto de actor que, dentro de una
 * `$transaction` interactiva, fije `app.actor_id` y `app.source` vía
 * `set_config(...)` para que `audit_logs` atribuya correctamente las escrituras
 * del bot (service_role).
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
