import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { fail, ToolFailure } from './tool-result';

/**
 * Mapeo de errores de Postgres → `error_code` estable del `ToolResult`
 * (blueprint Paso 5 §4).
 *
 * Principios:
 *  - Se distingue por SQLSTATE / nombre de constraint, NUNCA por el texto del
 *    `raise` (los triggers raisean en español y eso no es contrato estable).
 *  - REGLA DE NO-FILTRACIÓN (§A1): cualquier error no mapeado —en particular
 *    `42501 insufficient_privilege` si una query golpea el REVOKE de
 *    `clinical_notes`— cae a INTERNAL_ERROR con mensaje genérico. El detalle real
 *    (incluido cualquier nombre de tabla) va SOLO al log del servidor; el modelo
 *    nunca lo ve, así no puede inferir que la tabla existe o tiene datos.
 *
 * Las reglas de agenda (disponibilidad, prime time, secuencia, cool-down) raisean
 * todas con `check_violation` (23514), indistinguibles por SQLSTATE. Por eso los
 * handlers PRE-VALIDAN y producen el `error_code` preciso antes del INSERT; el
 * raise queda como red de seguridad ante carreras y acá se degrada a
 * SCHEDULING_CONFLICT (genérico, "reintentá / volvé a proponer").
 */

const PG = {
  UNIQUE_VIOLATION: '23505',
  EXCLUSION_VIOLATION: '23P01',
  CHECK_VIOLATION: '23514',
  INSUFFICIENT_PRIVILEGE: '42501',
} as const;

const GENERIC_INTERNAL_MESSAGE =
  'Ocurrió un problema procesando la solicitud. Intentá nuevamente en un momento.';

function pgCode(err: unknown): string | undefined {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Prisma expone el SQLSTATE original en meta.code para errores P2010/raw.
    const metaCode = (err.meta as { code?: unknown } | undefined)?.code;
    if (typeof metaCode === 'string') return metaCode;
  }
  // Errores crudos de pg (vía $queryRaw) traen `code` directamente.
  const code = (err as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' ? code : undefined;
}

function constraintName(err: unknown): string | undefined {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const target = err.meta?.target;
    if (typeof target === 'string') return target;
    if (Array.isArray(target)) return target.join(',');
  }
  const c = (err as { constraint?: unknown } | undefined)?.constraint;
  return typeof c === 'string' ? c : undefined;
}

/**
 * Convierte un error de BD en un `ToolFailure`. Loguea el detalle real
 * server-side y devuelve un mensaje seguro para el modelo.
 */
export function mapDbError(err: unknown, logger: Logger, context: string): ToolFailure {
  const code = pgCode(err);
  const constraint = constraintName(err);

  switch (code) {
    case PG.UNIQUE_VIOLATION:
      if (constraint?.includes('uq_patient_national_id')) {
        return fail(
          'DUPLICATE_PATIENT',
          'Ya existe un paciente con ese DNI en la clínica.',
        );
      }
      return fail(
        'DUPLICATE',
        'El registro ya existe y no puede duplicarse.',
      );

    case PG.EXCLUSION_VIOLATION:
      // appt_no_overlap: el horario fue tomado por otro turno (carrera).
      return fail(
        'OVERLAP',
        'Ese horario ya no está disponible. Volvé a proponer turnos.',
      );

    case PG.CHECK_VIOLATION:
      // Disponibilidad / prime time / secuencia / cool-down: indistinguibles por
      // SQLSTATE. Los handlers pre-validan; si llega acá es una carrera.
      return fail(
        'SCHEDULING_CONFLICT',
        'El horario dejó de cumplir las reglas de agenda. Volvé a proponer turnos.',
      );

    default:
      // Incluye 42501 (REVOKE clinical_notes) y cualquier fallo inesperado.
      // NO se filtra el mensaje crudo de Postgres al modelo.
      logger.error(
        `[${context}] Error de BD no mapeado (code=${code ?? 'n/a'}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return fail('INTERNAL_ERROR', GENERIC_INTERNAL_MESSAGE);
  }
}
