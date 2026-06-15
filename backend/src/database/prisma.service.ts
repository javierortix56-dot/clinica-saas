import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Fuentes conocidas de una escritura. El bot de WhatsApp escribe con la
 * service_role (bypassa RLS), por lo que el actor NO viaja en el JWT y hay que
 * fijarlo explícitamente para la auditoría.
 */
export const ActorSource = {
  WhatsappBot: 'whatsapp_bot',
  Staff: 'staff',
  System: 'system',
} as const;

export type ActorSource =
  | (typeof ActorSource)[keyof typeof ActorSource]
  // Permite otras fuentes sin perder el autocompletado de las conocidas.
  | (string & {});

export interface ActorContext {
  /** UUID del actor que origina la escritura (el bot, o el staff). */
  actorId: string;
  /** Origen de la escritura: 'whatsapp_bot' | 'staff' | ... */
  source: ActorSource;
}

/**
 * Opciones de la transacción interactiva (passthrough a Prisma).
 */
export type ActorTransactionOptions = {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
};

/**
 * Cliente Prisma como provider inyectable. Gestiona conexión/desconexión con el
 * ciclo de vida de Nest y expone el helper de contexto de actor para auditoría.
 *
 * Decisión clave del blueprint (§ "Contexto de actor para auditoría"):
 * el bot escribe con service_role, así que el trigger `audit_trigger` no puede
 * leer el actor del JWT. Cada escritura del bot debe correr dentro de una
 * transacción que fije `app.actor_id` y `app.source` con `set_config(..., true)`
 * ANTES de la operación. `is_local = true` ata el valor a esa transacción (y por
 * eso funciona con el pooler en modo transacción). Se usa `set_config()` —no
 * `SET LOCAL`— porque admite parámetros (evita inyección SQL).
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    // DIAGNÓSTICO TEMPORAL: con PRISMA_USE_DIRECT_URL=true, el runtime se conecta
    // por DIRECT_URL (conexión directa, 5432) en lugar de DATABASE_URL (pooler,
    // 6543). Sirve para distinguir un fallo del pooler de un fallo de credencial
    // ante un P1000. Dejar sin setear (o 'false') para operar normal por el pooler.
    const useDirectUrl =
      config.get<string>('PRISMA_USE_DIRECT_URL') === 'true';

    // super() debe ser sentencia raíz: se calculan las opciones antes.
    const options: Prisma.PrismaClientOptions | undefined = useDirectUrl
      ? { datasources: { db: { url: config.getOrThrow<string>('DIRECT_URL') } } }
      : undefined;
    super(options);

    if (useDirectUrl) {
      this.logger.warn(
        'PRISMA_USE_DIRECT_URL=true → Prisma se conecta vía DIRECT_URL (modo diagnóstico, NO usar en producción).',
      );
    }
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Ejecuta `work` dentro de una transacción interactiva con el contexto de
   * actor ya fijado, para que `audit_logs` atribuya correctamente las
   * escrituras. Usar SIEMPRE para escrituras del bot (service_role).
   *
   * @example
   * await prisma.runAsActor(
   *   { actorId: botUuid, source: ActorSource.WhatsappBot },
   *   (tx) => tx.appointments.create({ data: { ... } }),
   * );
   */
  async runAsActor<T>(
    actor: ActorContext,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: ActorTransactionOptions,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await this.applyActorContext(tx, actor);
      return work(tx);
    }, options);
  }

  /**
   * Atajo para escrituras del bot de WhatsApp (source = 'whatsapp_bot').
   */
  async runAsBot<T>(
    botActorId: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: ActorTransactionOptions,
  ): Promise<T> {
    return this.runAsActor(
      { actorId: botActorId, source: ActorSource.WhatsappBot },
      work,
      options,
    );
  }

  /**
   * Fija el contexto de actor en la transacción actual mediante `set_config`.
   * Los valores se pasan como parámetros (bind), nunca interpolados en el SQL.
   */
  private async applyActorContext(
    tx: Prisma.TransactionClient,
    actor: ActorContext,
  ): Promise<void> {
    // El tercer argumento (is_local) = true => el valor sólo vive en ESTA
    // transacción; al hacer COMMIT/ROLLBACK se descarta.
    await tx.$executeRaw`SELECT set_config('app.actor_id', ${actor.actorId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.source', ${actor.source}, true)`;
  }
}
