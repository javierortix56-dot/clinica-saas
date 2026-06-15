import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { Slot } from './slot-ranking';

export interface PhaseTemplate {
  id: string;
  name: string;
  sequence_order: number;
  phase_kind: 'clinical' | 'lab_wait';
  duration_minutes: number | null;
}

/**
 * Helpers de agenda compartidos por los handlers de scheduling (blueprint Paso 5
 * §5.E / §5.H). La lógica sensible a timezone (disponibilidad, banda prime) se
 * resuelve en SQL vía `$queryRaw`, espejando exactamente lo que hacen los
 * triggers `slot_is_available` / `enforce_prime_time_restriction`, para no
 * reimplementar matemática de zona horaria en JS.
 */
@Injectable()
export class SchedulingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Profesional activo: si se pasa id, valida; si no, devuelve el único activo (MVP B5). */
  async resolveProfessional(
    clinicId: string,
    professionalId?: string,
  ): Promise<{ id: string } | null> {
    if (professionalId) {
      return this.prisma.professionals.findFirst({
        where: {
          id: professionalId,
          clinic_id: clinicId,
          deleted_at: null,
          staff_members: { is_active: true },
        },
        select: { id: true },
      });
    }
    const profs = await this.prisma.professionals.findMany({
      where: {
        clinic_id: clinicId,
        deleted_at: null,
        staff_members: { is_active: true },
      },
      select: { id: true },
      orderBy: { created_at: 'asc' },
      take: 1,
    });
    return profs[0] ?? null;
  }

  async resolveTreatmentType(
    clinicId: string,
    name: string,
  ): Promise<{ id: string; name: string } | null> {
    return this.prisma.treatment_types.findFirst({
      where: {
        clinic_id: clinicId,
        is_active: true,
        deleted_at: null,
        name: { equals: name, mode: 'insensitive' },
      },
      select: { id: true, name: true },
    });
  }

  async resolvePhaseByName(
    treatmentTypeId: string,
    name: string,
  ): Promise<PhaseTemplate | null> {
    return this.prisma.treatment_phase_templates.findFirst({
      where: {
        treatment_type_id: treatmentTypeId,
        deleted_at: null,
        name: { equals: name, mode: 'insensitive' },
      },
      select: {
        id: true,
        name: true,
        sequence_order: true,
        phase_kind: true,
        duration_minutes: true,
      },
    }) as Promise<PhaseTemplate | null>;
  }

  async firstClinicalPhase(treatmentTypeId: string): Promise<PhaseTemplate | null> {
    return this.prisma.treatment_phase_templates.findFirst({
      where: {
        treatment_type_id: treatmentTypeId,
        deleted_at: null,
        phase_kind: 'clinical',
      },
      orderBy: { sequence_order: 'asc' },
      select: {
        id: true,
        name: true,
        sequence_order: true,
        phase_kind: true,
        duration_minutes: true,
      },
    }) as Promise<PhaseTemplate | null>;
  }

  /** Fases de un tipo ordenadas (para resolver la próxima pendiente). */
  async phasesOfType(treatmentTypeId: string): Promise<PhaseTemplate[]> {
    return this.prisma.treatment_phase_templates.findMany({
      where: { treatment_type_id: treatmentTypeId, deleted_at: null },
      orderBy: { sequence_order: 'asc' },
      select: {
        id: true,
        name: true,
        sequence_order: true,
        phase_kind: true,
        duration_minutes: true,
      },
    }) as Promise<PhaseTemplate[]>;
  }

  async countNoShows(patientId: string): Promise<number> {
    return this.prisma.appointments.count({
      where: { patient_id: patientId, status: 'no_show', deleted_at: null },
    });
  }

  /** Tratamientos activos del paciente para un tipo dado. */
  async activeTreatmentsOfType(
    clinicId: string,
    patientId: string,
    treatmentTypeId: string,
  ): Promise<{ id: string }[]> {
    return this.prisma.treatments.findMany({
      where: {
        clinic_id: clinicId,
        patient_id: patientId,
        treatment_type_id: treatmentTypeId,
        status: { in: ['planned', 'in_progress'] },
        deleted_at: null,
      },
      select: { id: true },
    });
  }

  /** ¿Hay un appointment no-cancelado de esta fase para este tratamiento? */
  async phaseAppointment(
    treatmentId: string,
    phaseTemplateId: string,
  ): Promise<{ end_at: Date } | null> {
    return this.prisma.appointments.findFirst({
      where: {
        treatment_id: treatmentId,
        phase_template_id: phaseTemplateId,
        status: { notIn: ['cancelled', 'no_show'] },
        deleted_at: null,
      },
      orderBy: { start_at: 'desc' },
      select: { end_at: true },
    });
  }

  /**
   * Inicio mínimo permitido por cool-down para `phase` dentro de `treatmentId`
   * (espeja `validate_treatment_sequence`). Devuelve:
   *  - { kind:'ok', minStart } con el inicio mínimo (o null si no hay restricción).
   *  - { kind:'missing_prev' } si falta el turno de la fase clínica previa.
   */
  async cooldownConstraint(
    treatmentId: string,
    treatmentTypeId: string,
    phase: PhaseTemplate,
  ): Promise<
    { kind: 'ok'; minStart: Date | null } | { kind: 'missing_prev' }
  > {
    const phases = await this.phasesOfType(treatmentTypeId);
    const prevClinical = phases
      .filter((p) => p.phase_kind === 'clinical' && p.sequence_order < phase.sequence_order)
      .sort((a, b) => b.sequence_order - a.sequence_order)[0];

    if (!prevClinical) return { kind: 'ok', minStart: null }; // primera fase clínica

    // Suma de cool-downs de las fases 'lab_wait' entre ambas clínicas
    // (`cooldown_days` no está en PhaseTemplate, se agrega en la BD).
    const cd = await this.prisma.treatment_phase_templates.aggregate({
      where: {
        treatment_type_id: treatmentTypeId,
        deleted_at: null,
        phase_kind: 'lab_wait',
        sequence_order: { gt: prevClinical.sequence_order, lt: phase.sequence_order },
      },
      _sum: { cooldown_days: true },
    });
    const totalCooldown = cd._sum.cooldown_days ?? 0;

    const prevAppt = await this.phaseAppointment(treatmentId, prevClinical.id);
    if (!prevAppt) return { kind: 'missing_prev' };

    const minStart = new Date(
      prevAppt.end_at.getTime() + totalCooldown * 24 * 60 * 60 * 1000,
    );
    return { kind: 'ok', minStart };
  }

  async slotIsAvailable(profId: string, start: Date, end: Date): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ ok: boolean }[]>(Prisma.sql`
      select slot_is_available(${profId}::uuid, ${start}::timestamptz, ${end}::timestamptz) as ok
    `);
    return rows[0]?.ok ?? false;
  }

  /** ¿El rango cae dentro de la banda prime del profesional? (espeja el trigger). */
  async inPrimeBand(profId: string, start: Date, end: Date): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ in_prime: boolean }[]>(Prisma.sql`
      select exists(
        select 1 from professionals pr join clinics c on c.id = pr.clinic_id
        where pr.id = ${profId}::uuid
          and (${start}::timestamptz at time zone c.timezone)::time < pr.prime_time_end
          and (${end}::timestamptz at time zone c.timezone)::time > pr.prime_time_start
      ) as in_prime
    `);
    return rows[0]?.in_prime ?? false;
  }

  /** Turnos no-cancelados del profesional en la ventana (para ranking de adyacencia). */
  async existingAppointments(
    profId: string,
    winStart: Date,
    winEnd: Date,
  ): Promise<Slot[]> {
    const rows = await this.prisma.appointments.findMany({
      where: {
        professional_id: profId,
        status: { notIn: ['cancelled', 'no_show'] },
        deleted_at: null,
        start_at: { lt: winEnd },
        end_at: { gt: winStart },
      },
      select: { start_at: true, end_at: true },
    });
    return rows.map((r) => ({ start: r.start_at, end: r.end_at }));
  }

  /**
   * Candidatos disponibles en la ventana (grilla cada `stepMin`), filtrados por
   * `slot_is_available`, sin solape con turnos existentes, y excluyendo la banda
   * prime si corresponde. Toda la matemática de timezone queda en SQL.
   */
  async candidateSlots(params: {
    profId: string;
    winStart: Date;
    winEnd: Date;
    durMin: number;
    stepMin: number;
    excludePrime: boolean;
  }): Promise<Slot[]> {
    const { profId, winStart, winEnd, durMin, stepMin, excludePrime } = params;
    const rows = await this.prisma.$queryRaw<{ start_at: Date; end_at: Date }[]>(
      Prisma.sql`
        with prof as (
          select pr.id, pr.prime_time_start as ps, pr.prime_time_end as pe, c.timezone as tz
          from professionals pr join clinics c on c.id = pr.clinic_id
          where pr.id = ${profId}::uuid
        ),
        cand as (
          select gs as start_at,
                 gs + make_interval(mins => ${durMin}::int) as end_at
          from generate_series(
                 ${winStart}::timestamptz,
                 ${winEnd}::timestamptz,
                 make_interval(mins => ${stepMin}::int)
               ) gs
        )
        select c.start_at, c.end_at
        from cand c, prof
        where c.end_at <= ${winEnd}::timestamptz
          and slot_is_available(${profId}::uuid, c.start_at, c.end_at)
          and not exists (
            select 1 from appointments a
            where a.professional_id = ${profId}::uuid
              and a.status not in ('cancelled','no_show')
              and a.deleted_at is null
              and tstzrange(a.start_at, a.end_at) && tstzrange(c.start_at, c.end_at)
          )
          and (
            ${excludePrime}::boolean = false
            or not (
              (c.start_at at time zone prof.tz)::time < prof.pe
              and (c.end_at at time zone prof.tz)::time > prof.ps
            )
          )
        order by c.start_at
        limit 300
      `,
    );
    return rows.map((r) => ({ start: r.start_at, end: r.end_at }));
  }
}
