import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ToolContext } from '../../ai/tools/tool-context';
import { ToolHandler } from '../../ai/tools/tool-handler.interface';
import { ToolName } from '../../ai/tools/tool-declarations';
import { fail, ok, ToolResult } from '../../ai/tools/tool-result';
import { InvalidArgsError, optionalString } from '../../ai/tools/args.util';
import { mapDbError } from '../../ai/tools/db-error.mapper';

type Tema = 'puntualidad' | 'no_show' | 'precios' | 'valoracion';
const TEMAS: Tema[] = ['puntualidad', 'no_show', 'precios', 'valoracion'];

/** `time` de Postgres (Prisma lo trae como Date UTC en 1970) → "HH:MM". */
function formatTime(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * `consultar_politicas_clinica` (R) — SINTETIZADO. Blueprint Paso 5 §5.C / §H.
 *
 * No hay tabla de políticas; cada `tema` se deriva de columnas/triggers
 * existentes. `puntualidad` es texto fijo (deuda técnica anotada: tabla
 * `clinic_policies` configurable, futura).
 */
@Injectable()
export class ConsultarPoliticasHandler implements ToolHandler {
  readonly name = ToolName.ConsultarPoliticasClinica;
  private readonly logger = new Logger(ConsultarPoliticasHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    let tema: string | undefined;
    try {
      tema = optionalString(args, 'tema');
    } catch (e) {
      if (e instanceof InvalidArgsError) return fail('INVALID_ARGS', e.message);
      throw e;
    }
    if (tema !== undefined && !TEMAS.includes(tema as Tema)) {
      return fail(
        'INVALID_ARGS',
        `Tema inválido. Válidos: ${TEMAS.join(', ')}.`,
      );
    }

    const pedidos: Tema[] = tema ? [tema as Tema] : TEMAS;

    try {
      const clinic = await this.prisma.clinics.findFirst({
        where: { id: ctx.clinicId, deleted_at: null },
        select: { currency: true, valuation_fee: true },
      });
      if (!clinic) return fail('NOT_FOUND', 'No se encontró la clínica.');

      const politicas: { tema: Tema; texto: string }[] = [];

      for (const t of pedidos) {
        switch (t) {
          case 'puntualidad':
            // Texto fijo (deuda técnica: tabla de políticas configurable).
            politicas.push({
              tema: t,
              texto:
                'Se otorgan 10 minutos de tolerancia desde el horario del turno.',
            });
            break;

          case 'no_show': {
            // Regla prime time: ≥2 ausencias restringen los horarios de mayor
            // demanda (umbral hardcodeado en el trigger). Incluye la banda del
            // profesional activo si lo hay (MVP: uno solo).
            const prof = await this.prisma.professionals.findFirst({
              where: {
                clinic_id: ctx.clinicId,
                deleted_at: null,
                staff_members: { is_active: true },
              },
              select: { prime_time_start: true, prime_time_end: true },
            });
            const banda = prof
              ? ` Los horarios de mayor demanda son de ${formatTime(
                  prof.prime_time_start,
                )} a ${formatTime(prof.prime_time_end)}.`
              : '';
            politicas.push({
              tema: t,
              texto:
                'Tras 2 ausencias sin aviso, el paciente no puede reservar en los ' +
                'horarios de mayor demanda hasta regularizar su situación.' +
                banda,
            });
            break;
          }

          case 'precios': {
            const tipos = await this.prisma.treatment_types.findMany({
              where: { clinic_id: ctx.clinicId, is_active: true, deleted_at: null },
              select: { name: true, price_min: true, price_max: true },
              orderBy: { name: 'asc' },
            });
            const conPrecio = tipos.filter(
              (x) => x.price_min !== null || x.price_max !== null,
            );
            const texto =
              conPrecio.length === 0
                ? 'Los precios se informan en la consulta de valoración.'
                : 'Los precios son orientativos y se confirman en la valoración: ' +
                  conPrecio
                    .map((x) => {
                      const min = x.price_min !== null ? Number(x.price_min) : null;
                      const max = x.price_max !== null ? Number(x.price_max) : null;
                      const rango =
                        min !== null && max !== null
                          ? `${min}–${max}`
                          : `${min ?? max}`;
                      return `${x.name} (${rango} ${clinic.currency})`;
                    })
                    .join('; ') +
                  '.';
            politicas.push({ tema: t, texto });
            break;
          }

          case 'valoracion':
            politicas.push({
              tema: t,
              texto:
                clinic.valuation_fee !== null
                  ? `La consulta de valoración tiene un costo de ${Number(
                      clinic.valuation_fee,
                    )} ${clinic.currency}.`
                  : 'La consulta de valoración define el plan de tratamiento y su presupuesto.',
            });
            break;
        }
      }

      return ok({ tema: tema ?? 'todas', politicas });
    } catch (err) {
      return mapDbError(err, this.logger, this.name);
    }
  }
}
