import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ToolContext } from '../../ai/tools/tool-context';
import { ToolHandler } from '../../ai/tools/tool-handler.interface';
import { ToolName } from '../../ai/tools/tool-declarations';
import { fail, ok, ToolResult } from '../../ai/tools/tool-result';
import {
  InvalidArgsError,
  requireDate,
  requireString,
} from '../../ai/tools/args.util';
import { mapDbError } from '../../ai/tools/db-error.mapper';
import { SchedulingService } from '../scheduling.service';

/**
 * `agendar_turno` (W) — blueprint Paso 5 §5.H.
 * Resuelve treatment_id (C2) + fase (C3), calcula end_at con duración base (C1,
 * sin modificadores), PRE-VALIDA las reglas de agenda para producir el error_code
 * preciso, y crea el turno en estado `proposed` / origin `whatsapp_bot`. Los
 * triggers quedan como red de seguridad ante carreras (→ OVERLAP / SCHEDULING_CONFLICT).
 */
@Injectable()
export class AgendarTurnoHandler implements ToolHandler {
  readonly name = ToolName.AgendarTurno;
  private readonly logger = new Logger(AgendarTurnoHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduling: SchedulingService,
  ) {}

  async execute(
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    let patientId: string, professionalId: string, treatmentPhase: string, startAt: Date;
    try {
      patientId = requireString(args, 'patient_id');
      professionalId = requireString(args, 'professional_id');
      treatmentPhase = requireString(args, 'treatment_phase');
      startAt = requireDate(args, 'start_at');
    } catch (e) {
      if (e instanceof InvalidArgsError) return fail('INVALID_ARGS', e.message);
      throw e;
    }

    try {
      const prof = await this.scheduling.resolveProfessional(
        ctx.clinicId,
        professionalId,
      );
      if (!prof) return fail('NOT_FOUND', 'El profesional indicado no está disponible.');

      const patient = await this.prisma.patients.findFirst({
        where: { id: patientId, clinic_id: ctx.clinicId, deleted_at: null },
        select: { id: true },
      });
      if (!patient) return fail('NOT_FOUND', 'No se encontró el paciente indicado.');

      // --- Resolver tratamiento + fase (C2/C3) ---
      const phases = await this.prisma.treatment_phase_templates.findMany({
        where: {
          clinic_id: ctx.clinicId,
          deleted_at: null,
          name: { equals: treatmentPhase, mode: 'insensitive' },
        },
        select: {
          id: true,
          treatment_type_id: true,
          phase_kind: true,
          duration_minutes: true,
          sequence_order: true,
          name: true,
        },
      });
      if (phases.length === 0) {
        return fail('NOT_FOUND', `No existe la fase "${treatmentPhase}".`);
      }
      const typeIds = [...new Set(phases.map((p) => p.treatment_type_id))];

      const treatments = await this.prisma.treatments.findMany({
        where: {
          clinic_id: ctx.clinicId,
          patient_id: patientId,
          status: { in: ['planned', 'in_progress'] },
          deleted_at: null,
          treatment_type_id: { in: typeIds },
        },
        select: { id: true, treatment_type_id: true },
      });
      if (treatments.length === 0) {
        return fail(
          'NOT_FOUND',
          'El paciente no tiene un tratamiento activo con esa fase.',
        );
      }
      if (treatments.length > 1) {
        return fail(
          'AMBIGUOUS_TREATMENT',
          'El paciente tiene más de un tratamiento activo con esa fase; especificá cuál.',
        );
      }
      const treatment = treatments[0];
      const phase = phases.find(
        (p) => p.treatment_type_id === treatment.treatment_type_id,
      )!;

      if (phase.phase_kind !== 'clinical' || phase.duration_minutes == null) {
        return fail(
          'INVALID_ARGS',
          'Esa fase no se agenda como turno con el profesional.',
        );
      }

      // --- end_at = inicio + duración base (C1: sin modificadores de tecnología) ---
      const endAt = new Date(startAt.getTime() + phase.duration_minutes * 60000);

      // --- PRE-VALIDACIÓN de reglas (error_code preciso antes del INSERT) ---
      if (!(await this.scheduling.slotIsAvailable(prof.id, startAt, endAt))) {
        return fail(
          'NO_AVAILABILITY',
          'El profesional no tiene disponibilidad en ese horario.',
        );
      }

      const noShows = await this.scheduling.countNoShows(patientId);
      if (noShows >= 2 && (await this.scheduling.inPrimeBand(prof.id, startAt, endAt))) {
        return fail(
          'PRIME_TIME_BLOCKED',
          'Ese horario es de alta demanda y no está disponible para este paciente.',
        );
      }

      const cd = await this.scheduling.cooldownConstraint(
        treatment.id,
        treatment.treatment_type_id,
        {
          id: phase.id,
          name: phase.name,
          sequence_order: phase.sequence_order,
          phase_kind: phase.phase_kind,
          duration_minutes: phase.duration_minutes,
        },
      );
      if (cd.kind === 'missing_prev') {
        return fail(
          'SEQUENCE_VIOLATION',
          'No se puede agendar esta fase sin haber agendado la fase clínica previa.',
        );
      }
      if (cd.minStart && startAt.getTime() < cd.minStart.getTime()) {
        return fail(
          'COOLDOWN_VIOLATION',
          `La fase no puede iniciar antes del ${cd.minStart.toISOString()} (cool-down).`,
        );
      }

      // --- INSERT (status proposed, origin whatsapp_bot) en runAsBot ---
      const appt = await this.prisma.runAsBot(ctx.actor.actorId, (tx) =>
        tx.appointments.create({
          data: {
            clinic_id: ctx.clinicId,
            treatment_id: treatment.id,
            phase_template_id: phase.id,
            patient_id: patientId,
            professional_id: prof.id,
            start_at: startAt,
            end_at: endAt,
            status: 'proposed',
            origin: 'whatsapp_bot',
          },
          select: { id: true, status: true, start_at: true, end_at: true },
        }),
      );

      return ok({
        appointment_id: appt.id,
        status: appt.status,
        start_at: appt.start_at.toISOString(),
        end_at: appt.end_at.toISOString(),
      });
    } catch (err) {
      // Red de seguridad: 23P01→OVERLAP, 23514→SCHEDULING_CONFLICT, etc.
      return mapDbError(err, this.logger, this.name);
    }
  }
}
