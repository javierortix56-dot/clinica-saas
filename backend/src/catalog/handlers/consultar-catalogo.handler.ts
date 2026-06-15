import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ToolContext } from '../../ai/tools/tool-context';
import { ToolHandler } from '../../ai/tools/tool-handler.interface';
import { ToolName } from '../../ai/tools/tool-declarations';
import { fail, ok, ToolResult } from '../../ai/tools/tool-result';
import { InvalidArgsError, optionalString } from '../../ai/tools/args.util';
import { mapDbError } from '../../ai/tools/db-error.mapper';

/** Decimal | null → number | null, para serializar al modelo sin objetos Decimal. */
function dec(v: Prisma.Decimal | null): number | null {
  return v === null ? null : Number(v);
}

/**
 * `consultar_catalogo` (R) — blueprint Paso 5 §5.B.
 * Tipos de tratamiento activos (rango de precios orientativo) + tarifa de
 * valoración y moneda de la clínica. Filtro opcional por `treatment_type` (ILIKE).
 */
@Injectable()
export class ConsultarCatalogoHandler implements ToolHandler {
  readonly name = ToolName.ConsultarCatalogo;
  private readonly logger = new Logger(ConsultarCatalogoHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    let treatmentType: string | undefined;
    try {
      treatmentType = optionalString(args, 'treatment_type');
    } catch (e) {
      if (e instanceof InvalidArgsError) return fail('INVALID_ARGS', e.message);
      throw e;
    }

    try {
      const clinic = await this.prisma.clinics.findFirst({
        where: { id: ctx.clinicId, deleted_at: null },
        select: { currency: true, valuation_fee: true },
      });
      if (!clinic) {
        return fail('NOT_FOUND', 'No se encontró la clínica.');
      }

      const types = await this.prisma.treatment_types.findMany({
        where: {
          clinic_id: ctx.clinicId,
          is_active: true,
          deleted_at: null,
          ...(treatmentType
            ? { name: { contains: treatmentType, mode: 'insensitive' } }
            : {}),
        },
        select: {
          name: true,
          description: true,
          price_min: true,
          price_max: true,
        },
        orderBy: { name: 'asc' },
      });

      return ok({
        moneda: clinic.currency,
        valoracion: { precio: dec(clinic.valuation_fee), moneda: clinic.currency },
        tratamientos: types.map((t) => ({
          name: t.name,
          description: t.description,
          price_min: dec(t.price_min),
          price_max: dec(t.price_max),
          moneda: clinic.currency,
          orientativo: true,
        })),
      });
    } catch (err) {
      return mapDbError(err, this.logger, this.name);
    }
  }
}
