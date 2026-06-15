import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ToolContext } from '../../ai/tools/tool-context';
import { ToolHandler } from '../../ai/tools/tool-handler.interface';
import { ToolName } from '../../ai/tools/tool-declarations';
import { fail, ok, ToolResult } from '../../ai/tools/tool-result';
import { InvalidArgsError, requireString } from '../../ai/tools/args.util';
import { mapDbError } from '../../ai/tools/db-error.mapper';

/**
 * `consultar_historial_paciente` (R) — RESUMEN SEGURO. Blueprint Paso 5 §5.D / §6.
 *
 * Devuelve tratamientos (tipo, profesional, estado, fechas) y turnos (fase,
 * estado, fecha). NUNCA toca `clinical_notes`: además del REVOKE del rol
 * `clinic_bot` (§2), acá simplemente no se consulta. Tampoco expone
 * no_show_count / restrict_prime_time (§F: omitido).
 */
@Injectable()
export class ConsultarHistorialHandler implements ToolHandler {
  readonly name = ToolName.ConsultarHistorialPaciente;
  private readonly logger = new Logger(ConsultarHistorialHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    let patientId: string;
    try {
      patientId = requireString(args, 'patient_id');
    } catch (e) {
      if (e instanceof InvalidArgsError) return fail('INVALID_ARGS', e.message);
      throw e;
    }

    try {
      const patient = await this.prisma.patients.findFirst({
        where: { id: patientId, clinic_id: ctx.clinicId, deleted_at: null },
        select: { id: true },
      });
      if (!patient) {
        return fail('NOT_FOUND', 'No se encontró el paciente indicado.');
      }

      const treatments = await this.prisma.treatments.findMany({
        where: { patient_id: patientId, clinic_id: ctx.clinicId, deleted_at: null },
        select: {
          id: true,
          status: true,
          created_at: true,
          treatment_types: { select: { name: true } },
          professionals: {
            select: { staff_members: { select: { full_name: true } } },
          },
        },
        orderBy: { created_at: 'desc' },
      });

      const appointments = await this.prisma.appointments.findMany({
        where: { patient_id: patientId, clinic_id: ctx.clinicId, deleted_at: null },
        select: {
          start_at: true,
          status: true,
          treatment_phase_templates: { select: { name: true } },
          professionals: {
            select: { staff_members: { select: { full_name: true } } },
          },
        },
        orderBy: { start_at: 'desc' },
      });

      return ok({
        patient_id: patientId,
        tratamientos: treatments.map((t) => ({
          treatment_id: t.id,
          treatment_type: t.treatment_types?.name ?? null,
          professional: t.professionals?.staff_members?.full_name ?? null,
          estado: t.status,
          iniciado_en: t.created_at.toISOString(),
        })),
        turnos: appointments.map((a) => ({
          fase: a.treatment_phase_templates?.name ?? null,
          estado: a.status,
          fecha: a.start_at.toISOString(),
          professional: a.professionals?.staff_members?.full_name ?? null,
        })),
        // Marca explícita del contrato: jamás se exponen notas clínicas.
        clinical_notes_excluidas: true,
      });
    } catch (err) {
      return mapDbError(err, this.logger, this.name);
    }
  }
}
