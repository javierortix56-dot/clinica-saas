import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

/**
 * VaultService — lectura/escritura de secretos en Supabase Vault.
 *
 * Vault es una extensión de Postgres (pgsodium). Las funciones vault.*
 * requieren el rol `postgres` (superuser). Por eso este servicio crea su
 * propio PrismaClient usando DIRECT_URL (conexión directa, rol postgres),
 * distinto del PrismaService principal que usa DATABASE_URL (clinic_bot).
 *
 * Solo se usa para operaciones de Vault; NUNCA para datos de negocio.
 */
@Injectable()
export class VaultService {
  private readonly logger = new Logger(VaultService.name);
  private readonly vaultClient: PrismaClient;

  constructor(config: ConfigService) {
    const directUrl = config.getOrThrow<string>('DIRECT_URL');
    this.vaultClient = new PrismaClient({
      datasources: { db: { url: directUrl } },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.vaultClient.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.vaultClient.$disconnect();
  }

  /** Crea un secreto en Vault y devuelve su UUID de referencia. */
  async createSecret(secret: string, name: string): Promise<string> {
    const rows = await this.vaultClient.$queryRaw<[{ id: string }]>`
      SELECT vault.create_secret(${secret}::text, ${name}::text) AS id
    `;
    return rows[0].id;
  }

  /** Lee y descifra un secreto por su UUID. Devuelve null si no existe. */
  async readSecret(secretId: string): Promise<string | null> {
    const rows = await this.vaultClient.$queryRaw<
      [{ decrypted_secret: string | null }]
    >`
      SELECT decrypted_secret
      FROM vault.decrypted_secrets
      WHERE id = ${secretId}::uuid
      LIMIT 1
    `;
    return rows[0]?.decrypted_secret ?? null;
  }

  /** Actualiza el contenido de un secreto existente. */
  async updateSecret(secretId: string, secret: string): Promise<void> {
    await this.vaultClient.$executeRaw`
      SELECT vault.update_secret(${secretId}::uuid, ${secret}::text)
    `;
  }

  /** Elimina un secreto de Vault. */
  async deleteSecret(secretId: string): Promise<void> {
    try {
      await this.vaultClient.$executeRaw`
        DELETE FROM vault.secrets WHERE id = ${secretId}::uuid
      `;
    } catch (err) {
      this.logger.warn(`No se pudo eliminar secreto ${secretId}: ${String(err)}`);
    }
  }
}
