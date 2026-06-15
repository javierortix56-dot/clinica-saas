import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ToolContext } from '../../ai/tools/tool-context';
import { ToolHandler } from '../../ai/tools/tool-handler.interface';
import { ToolName } from '../../ai/tools/tool-declarations';
import { fail, ok, ToolResult } from '../../ai/tools/tool-result';
import { InvalidArgsError, requireString } from '../../ai/tools/args.util';
import { mapDbError } from '../../ai/tools/db-error.mapper';
import { SchedulingService } from '../scheduling.service';

/**
 * `iniciar_tratamiento` (W) — blueprint Paso 5 §5.G / §E.
 * Crea solo la fila `treatments` (`status='planned'`, sin profesional). NO crea
 * appointments ni instancias de fase: las fases son templates y el progreso se
 * deriva de los appointments. Devuelve la secuencia de fases (informativa).
 */
@Injectable()
export class IniciarTratamientoHandler implements ToolHandler {
  readonly name = ToolName.IniciarTratamiento;
  private readonly logger = new Logger(IniciarTratamientoHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduling: SchedulingService,
  ) {}

  async execute(
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    let patientId: string, treatmentType: string;
    try {
      patientId = requireString(args, 'patient_id');
      treatmentType = requireString(args, 'treatment_type');
    } catch (e) {
      if (e instanceof InvalidArgsError) return fail('INVALID_ARGS', e.message);
      throw e;
    }

    try {
      const patient = await this.prisma.patients.findFirst({
        where: { id: patientId, clinic_id: ctx.clinicId, deleted_at: null },
        select: { id: true },
      });
      if (!patient) return fail('NOT_FOUND', 'No se encontró el paciente indicado.');

      const type = await this.scheduling.resolveTreatmentType(
        ctx.clinicId,
        treatmentType,
      );
      if (!type) {
        return fail('NOT_FOUND', `No existe el tratamiento "${treatmentType}".`);
      }

      const treatment = await this.prisma.runAsBot(ctx.actor.actorId, (tx) =>
        tx.treatments.create({
          data: {
            clinic_id: ctx.clinicId,
            patient_id: patientId,
            treatment_type_id: type.id,
            status: 'planned',
          },
          select: { id: true, status: true },
        }),
      );

      const phases = await this.scheduling.phasesOfType(type.id);

      return ok({
        treatment_id: treatment.id,
        treatment_type: type.name,
        status: treatment.status,
        fases: phases.map((p) => ({
          name: p.name,
          sequence_order: p.sequence_order,
          phase_kind: p.phase_kind,
        })),
      });
    } catch (err) {
      return mapDbError(err, this.logger, this.name);
    }
  }
}
