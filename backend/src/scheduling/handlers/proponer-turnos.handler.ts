import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ToolContext } from '../../ai/tools/tool-context';
import { ToolHandler } from '../../ai/tools/tool-handler.interface';
import { ToolName } from '../../ai/tools/tool-declarations';
import { fail, ok, ToolResult } from '../../ai/tools/tool-result';
import {
  InvalidArgsError,
  optionalDate,
  optionalString,
  requireString,
} from '../../ai/tools/args.util';
import { mapDbError } from '../../ai/tools/db-error.mapper';
import { PhaseTemplate, SchedulingService } from '../scheduling.service';
import { rankSlots } from '../slot-ranking';

const STEP_MINUTES = 15;
const DEFAULT_WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `proponer_turnos` (R) — el núcleo. Blueprint Paso 5 §5.E.
 * Grilla cada 15 min + `slot_is_available` + cool-down + prime time silencioso
 * (B6) + orden por adyacencia/colchón (B1) + top 3 / NO_SLOTS (B7).
 */
@Injectable()
export class ProponerTurnosHandler implements ToolHandler {
  readonly name = ToolName.ProponerTurnos;
  private readonly logger = new Logger(ProponerTurnosHandler.name);
  private readonly bufferMin: number;

  constructor(
    private readonly scheduling: SchedulingService,
    config: ConfigService,
  ) {
    this.bufferMin = Number(
      config.get<string>('SCHEDULING_ADJACENCY_BUFFER_MIN') ?? '5',
    );
  }

  async execute(
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    let treatmentType: string;
    let fase: string | undefined;
    let professionalId: string | undefined;
    let desde: Date | undefined;
    let hasta: Date | undefined;
    try {
      treatmentType = requireString(args, 'treatment_type');
      fase = optionalString(args, 'fase');
      professionalId = optionalString(args, 'professional_id');
      desde = optionalDate(args, 'desde');
      hasta = optionalDate(args, 'hasta');
    } catch (e) {
      if (e instanceof InvalidArgsError) return fail('INVALID_ARGS', e.message);
      throw e;
    }

    try {
      const prof = await this.scheduling.resolveProfessional(
        ctx.clinicId,
        professionalId,
      );
      if (!prof) return fail('NOT_FOUND', 'No hay un profesional activo disponible.');

      const type = await this.scheduling.resolveTreatmentType(
        ctx.clinicId,
        treatmentType,
      );
      if (!type) return fail('NOT_FOUND', `No existe el tratamiento "${treatmentType}".`);

      // --- Resolver fase objetivo + inicio mínimo por cool-down (B4) ---
      const target = await this.resolveTarget(ctx, type.id, fase);
      if ('error' in target) return target.error;
      const { phase, minStart } = target;

      if (phase.phase_kind !== 'clinical' || phase.duration_minutes == null) {
        return fail(
          'INVALID_ARGS',
          'Esa fase no requiere un turno con el profesional.',
        );
      }

      // --- Ventana de búsqueda (B2) ---
      const now = new Date();
      const tomorrow = new Date(now.getTime() + DAY_MS);
      let winStart = desde ?? tomorrow;
      for (const lower of [now, minStart]) {
        if (lower && lower.getTime() > winStart.getTime()) winStart = lower;
      }
      const winEnd = hasta ?? new Date(winStart.getTime() + DEFAULT_WINDOW_DAYS * DAY_MS);
      if (winEnd.getTime() <= winStart.getTime()) {
        return fail('NO_SLOTS', 'No hay franjas en la ventana indicada. Ampliá el rango.');
      }

      // --- Prime time silencioso (B6) ---
      const excludePrime = ctx.patientId
        ? (await this.scheduling.countNoShows(ctx.patientId)) >= 2
        : false;

      const candidates = await this.scheduling.candidateSlots({
        profId: prof.id,
        winStart,
        winEnd,
        durMin: phase.duration_minutes,
        stepMin: STEP_MINUTES,
        excludePrime,
      });

      const existing = await this.scheduling.existingAppointments(
        prof.id,
        winStart,
        winEnd,
      );

      const ranked = rankSlots(candidates, existing, this.bufferMin, 3);
      if (ranked.length === 0) {
        return fail(
          'NO_SLOTS',
          'No hay turnos disponibles en ese rango. Probá una ventana más amplia.',
        );
      }

      return ok({
        treatment_type: type.name,
        fase: phase.name,
        propuestas: ranked.map((s) => ({
          professional_id: prof.id,
          start_at: s.start.toISOString(),
          end_at: s.end.toISOString(),
        })),
      });
    } catch (err) {
      return mapDbError(err, this.logger, this.name);
    }
  }

  /**
   * Determina la fase a proponer y el inicio mínimo por cool-down.
   * - `fase` explícita → se resuelve por nombre.
   * - paciente con 1 tratamiento activo del tipo → próxima fase clínica pendiente.
   * - sin contexto de paciente → primera fase clínica del tipo (sin restricción).
   */
  private async resolveTarget(
    ctx: ToolContext,
    treatmentTypeId: string,
    fase: string | undefined,
  ): Promise<
    | { phase: PhaseTemplate; minStart: Date | null }
    | { error: ToolResult }
  > {
    // Tratamiento activo del paciente (si lo hay) para derivar cool-down.
    let activeTreatmentId: string | null = null;
    if (ctx.patientId) {
      const actives = await this.scheduling.activeTreatmentsOfType(
        ctx.clinicId,
        ctx.patientId,
        treatmentTypeId,
      );
      if (actives.length > 1) {
        return {
          error: fail(
            'AMBIGUOUS_TREATMENT',
            'El paciente tiene más de un tratamiento activo de ese tipo; especificá cuál.',
          ),
        };
      }
      activeTreatmentId = actives[0]?.id ?? null;
    }

    if (fase) {
      const phase = await this.scheduling.resolvePhaseByName(treatmentTypeId, fase);
      if (!phase) return { error: fail('NOT_FOUND', `No existe la fase "${fase}".`) };
      const minStart = await this.minStartFor(activeTreatmentId, treatmentTypeId, phase);
      if ('error' in minStart) return minStart;
      return { phase, minStart: minStart.value };
    }

    if (activeTreatmentId) {
      // Próxima fase clínica pendiente (sin appointment) del tratamiento activo.
      const phases = (await this.scheduling.phasesOfType(treatmentTypeId)).filter(
        (p) => p.phase_kind === 'clinical',
      );
      for (const p of phases) {
        const appt = await this.scheduling.phaseAppointment(activeTreatmentId, p.id);
        if (!appt) {
          const minStart = await this.minStartFor(activeTreatmentId, treatmentTypeId, p);
          if ('error' in minStart) return minStart;
          return { phase: p, minStart: minStart.value };
        }
      }
      return {
        error: fail(
          'NO_PENDING_PHASE',
          'El tratamiento no tiene fases pendientes de agendar.',
        ),
      };
    }

    // Paciente nuevo / sin tratamiento: primera fase clínica del tipo.
    const first = await this.scheduling.firstClinicalPhase(treatmentTypeId);
    if (!first) {
      return { error: fail('NOT_FOUND', 'El tratamiento no tiene fases clínicas.') };
    }
    return { phase: first, minStart: null };
  }

  private async minStartFor(
    treatmentId: string | null,
    treatmentTypeId: string,
    phase: PhaseTemplate,
  ): Promise<{ value: Date | null } | { error: ToolResult }> {
    if (!treatmentId) return { value: null };
    const cd = await this.scheduling.cooldownConstraint(
      treatmentId,
      treatmentTypeId,
      phase,
    );
    if (cd.kind === 'missing_prev') {
      return {
        error: fail(
          'SEQUENCE_VIOLATION',
          'No se puede proponer esta fase: falta agendar la fase clínica previa.',
        ),
      };
    }
    return { value: cd.minStart };
  }
}
