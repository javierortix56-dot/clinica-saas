import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ToolContext } from '../../ai/tools/tool-context';
import { ToolHandler } from '../../ai/tools/tool-handler.interface';
import { ToolName } from '../../ai/tools/tool-declarations';
import { fail, ok, ToolResult } from '../../ai/tools/tool-result';
import { InvalidArgsError, requireString } from '../../ai/tools/args.util';
import { mapDbError } from '../../ai/tools/db-error.mapper';

/**
 * `buscar_paciente_por_dni` (R) — blueprint Paso 5 §5.A.
 * Busca por (clinic_id, national_id). `found:false` es ÉXITO (gatilla flujo de
 * paciente nuevo), no error.
 */
@Injectable()
export class BuscarPacienteHandler implements ToolHandler {
  readonly name = ToolName.BuscarPacientePorDni;
  private readonly logger = new Logger(BuscarPacienteHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    let dni: string;
    try {
      dni = requireString(args, 'dni');
    } catch (e) {
      if (e instanceof InvalidArgsError) return fail('INVALID_ARGS', e.message);
      throw e;
    }

    try {
      const patient = await this.prisma.patients.findFirst({
        where: { clinic_id: ctx.clinicId, national_id: dni, deleted_at: null },
        select: { id: true, national_id: true, full_name: true, phone: true },
      });

      if (!patient) return ok({ found: false });

      return ok({
        found: true,
        patient: {
          patient_id: patient.id,
          dni: patient.national_id,
          full_name: patient.full_name,
          phone: patient.phone,
        },
      });
    } catch (err) {
      return mapDbError(err, this.logger, this.name);
    }
  }
}
