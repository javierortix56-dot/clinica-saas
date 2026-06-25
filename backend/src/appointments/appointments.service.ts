import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ActorSource, PrismaService } from '../database/prisma.service';
import type { AuthUser } from '../auth/auth-user.interface';
import type { PatientUser } from '../auth/patient-user.interface';
import { GoogleCalendarEventService } from '../google-calendar/google-calendar-event.service';
import { CreateManualAppointmentDto } from './dto/create-manual-appointment.dto';

export interface ConfirmAppointmentResult {
  id: string;
  status: string;
  start_at: string;
  end_at: string;
}

const SELECT = {
  id: true,
  status: true,
  start_at: true,
  end_at: true,
} as const;

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gcal: GoogleCalendarEventService,
  ) {}

  /**
   * Confirma un turno `proposed` -> `confirmed`. Idempotente: si ya está
   * `confirmed`, devuelve el turno sin error. Cualquier otro estado -> 409.
   *
   * AISLAMIENTO TENANT EN CÓDIGO: la conexión del backend usa un rol que
   * BYPASSA RLS (migración 0006), así que TODA query filtra por `clinic_id`
   * explícito. Sin ese filtro, un staff podría confirmar turnos de otra clínica.
   *
   * AUDITORÍA: el update corre en `runAsActor` con el `sub` del staff como actor
   * y source 'staff', para que `audit_logs` atribuya el cambio correctamente
   * (el JWT del staff no viaja en la conexión Prisma).
   */
  async confirm(
    appointmentId: string,
    user: AuthUser,
  ): Promise<ConfirmAppointmentResult> {
    const appt = await this.prisma.appointments.findFirst({
      where: { id: appointmentId, clinic_id: user.clinicId, deleted_at: null },
      select: SELECT,
    });
    if (!appt) {
      throw new NotFoundException('Turno no encontrado.');
    }

    // Idempotencia: ya confirmado -> no-op exitoso.
    if (appt.status === 'confirmed') {
      return this.toResult(appt);
    }

    // Solo se confirma desde 'proposed'. cancelled/completed/in_progress/no_show -> 409.
    if (appt.status !== 'proposed') {
      throw new ConflictException(
        `No se puede confirmar un turno en estado "${appt.status}".`,
      );
    }

    let count: number;
    try {
      const res = await this.prisma.runAsActor(
        { actorId: user.userId, source: ActorSource.Staff },
        (tx) =>
          tx.appointments.updateMany({
            // status: 'proposed' en el WHERE => guard de carrera atómico.
            where: {
              id: appointmentId,
              clinic_id: user.clinicId,
              status: 'proposed',
              deleted_at: null,
            },
            data: { status: 'confirmed' },
          }),
      );
      count = res.count;
    } catch (err) {
      throw this.mapWriteError(err);
    }

    // 0 filas => alguien cambió el estado entre el read y el update (carrera).
    if (count === 0) {
      const after = await this.prisma.appointments.findFirst({
        where: { id: appointmentId, clinic_id: user.clinicId, deleted_at: null },
        select: SELECT,
      });
      if (after?.status === 'confirmed') {
        return this.toResult(after); // confirmado por otra request: idempotente.
      }
      throw new ConflictException(
        'El turno cambió de estado y no se pudo confirmar.',
      );
    }

    const after = await this.prisma.appointments.findFirstOrThrow({
      where: { id: appointmentId, clinic_id: user.clinicId },
      select: SELECT,
    });

    // Sincronizar con Google Calendar de forma asincrónica (no bloquea la respuesta).
    void this.gcal.upsertEvent(appointmentId).catch((err: unknown) =>
      this.logger.error(
        `GCal upsert falló para turno ${appointmentId}: ${String(err)}`,
      ),
    );

    return this.toResult(after);
  }

  /**
   * Cancela un turno (recepción/admin). Idempotente: si ya está `cancelled`,
   * devuelve el turno sin error. Tras cancelar, elimina el evento del Google
   * Calendar del profesional de forma asincrónica (si estaba sincronizado).
   */
  async cancel(
    appointmentId: string,
    user: AuthUser,
  ): Promise<ConfirmAppointmentResult> {
    const appt = await this.prisma.appointments.findFirst({
      where: { id: appointmentId, clinic_id: user.clinicId, deleted_at: null },
      select: SELECT,
    });
    if (!appt) {
      throw new NotFoundException('Turno no encontrado.');
    }

    // Idempotencia: ya cancelado -> no-op exitoso.
    if (appt.status === 'cancelled') {
      return this.toResult(appt);
    }

    try {
      await this.prisma.runAsActor(
        { actorId: user.userId, source: ActorSource.Staff },
        (tx) =>
          tx.appointments.updateMany({
            where: {
              id: appointmentId,
              clinic_id: user.clinicId,
              deleted_at: null,
              status: { not: 'cancelled' },
            },
            data: { status: 'cancelled' },
          }),
      );
    } catch (err) {
      throw this.mapManualWriteError(err);
    }

    const after = await this.prisma.appointments.findFirstOrThrow({
      where: { id: appointmentId, clinic_id: user.clinicId },
      select: SELECT,
    });

    // Eliminar el evento de Google Calendar (no bloquea la respuesta).
    void this.gcal.deleteEvent(appointmentId).catch((err: unknown) =>
      this.logger.error(
        `GCal delete falló para turno ${appointmentId}: ${String(err)}`,
      ),
    );

    return this.toResult(after);
  }

  /**
   * Alta manual de turno por el staff (recepción/admin). Inserta directamente
   * como `confirmed` con origin='staff' (bypassa disponibilidad por migración
   * 0011; el anti-solape `appt_no_overlap` se mantiene). Tras el alta, sincroniza
   * con Google Calendar de forma asincrónica.
   *
   * professional_id y patient_id se validan contra la clínica del JWT — el body
   * nunca es fuente de verdad del tenant.
   */
  async createManual(
    dto: CreateManualAppointmentDto,
    user: AuthUser,
  ): Promise<ConfirmAppointmentResult> {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (endAt.getTime() <= startAt.getTime()) {
      throw new BadRequestException(
        'El horario de fin debe ser posterior al de inicio.',
      );
    }

    // El profesional debe pertenecer a la clínica del usuario.
    const prof = await this.prisma.professionals.findFirst({
      where: { id: dto.professionalId, clinic_id: user.clinicId },
      select: { id: true },
    });
    if (!prof) {
      throw new NotFoundException('Profesional no encontrado en la clínica.');
    }

    // El paciente debe pertenecer a la clínica del usuario.
    const patient = await this.prisma.patients.findFirst({
      where: {
        id: dto.patientId,
        clinic_id: user.clinicId,
        deleted_at: null,
      },
      select: { id: true },
    });
    if (!patient) {
      throw new NotFoundException('Paciente no encontrado en la clínica.');
    }

    let appt: {
      id: string;
      status: string;
      start_at: Date;
      end_at: Date;
    };
    try {
      appt = await this.prisma.runAsActor(
        { actorId: user.userId, source: ActorSource.Staff },
        (tx) =>
          tx.appointments.create({
            data: {
              clinic_id: user.clinicId,
              patient_id: dto.patientId,
              professional_id: dto.professionalId,
              start_at: startAt,
              end_at: endAt,
              status: 'confirmed',
              origin: 'staff',
            },
            select: SELECT,
          }),
      );
    } catch (err) {
      throw this.mapManualWriteError(err);
    }

    // Sincronizar con Google Calendar de forma asincrónica (no bloquea la respuesta).
    void this.gcal.upsertEvent(appt.id).catch((err: unknown) =>
      this.logger.error(
        `GCal upsert falló para turno ${appt.id}: ${String(err)}`,
      ),
    );

    return this.toResult(appt);
  }

  /**
   * Cancela un turno desde el portal del paciente. A diferencia de `cancel`
   * (staff), el aislamiento se hace por `patient_id` (el JWT del paciente no
   * trae clinic_id). Reglas del portal: solo turnos `proposed`/`confirmed` y que
   * todavía no ocurrieron. Tras cancelar, elimina el evento espejo del Google
   * Calendar del profesional (lo que el write directo a Supabase no hacía).
   */
  async cancelByPatient(
    appointmentId: string,
    patient: PatientUser,
  ): Promise<ConfirmAppointmentResult> {
    const appt = await this.prisma.appointments.findFirst({
      where: {
        id: appointmentId,
        patient_id: patient.patientId,
        deleted_at: null,
      },
      select: { ...SELECT, start_at: true },
    });
    if (!appt) {
      throw new NotFoundException('Turno no encontrado.');
    }

    // Idempotencia: ya cancelado -> no-op exitoso.
    if (appt.status === 'cancelled') {
      return this.toResult(appt);
    }
    if (appt.status !== 'proposed' && appt.status !== 'confirmed') {
      throw new ConflictException(
        'Solo se pueden cancelar turnos propuestos o confirmados.',
      );
    }
    if (appt.start_at.getTime() < Date.now()) {
      throw new BadRequestException(
        'No se puede cancelar un turno que ya ocurrió.',
      );
    }

    try {
      await this.prisma.runAsActor(
        { actorId: patient.userId, source: 'patient' },
        (tx) =>
          tx.appointments.updateMany({
            where: {
              id: appointmentId,
              patient_id: patient.patientId,
              deleted_at: null,
              status: { in: ['proposed', 'confirmed'] },
            },
            data: { status: 'cancelled' },
          }),
      );
    } catch (err) {
      throw this.mapManualWriteError(err);
    }

    const after = await this.prisma.appointments.findFirstOrThrow({
      where: { id: appointmentId, patient_id: patient.patientId },
      select: SELECT,
    });

    // Eliminar el evento de Google Calendar del profesional (no bloquea).
    void this.gcal.deleteEvent(appointmentId).catch((err: unknown) =>
      this.logger.error(
        `GCal delete falló para turno ${appointmentId}: ${String(err)}`,
      ),
    );

    return this.toResult(after);
  }

  /**
   * Actualiza el estado de un turno a in_progress, completed o no_show.
   * Transiciones válidas: confirmed → in_progress | no_show; in_progress → completed.
   * Filtrado por clinic_id del JWT para aislamiento de tenant.
   */
  async updateStatus(
    appointmentId: string,
    status: 'in_progress' | 'completed' | 'no_show',
    user: AuthUser,
  ): Promise<ConfirmAppointmentResult> {
    const appt = await this.prisma.appointments.findFirst({
      where: { id: appointmentId, clinic_id: user.clinicId, deleted_at: null },
      select: SELECT,
    });
    if (!appt) {
      throw new NotFoundException('Turno no encontrado.');
    }

    const valid: Record<string, string[]> = {
      confirmed: ['in_progress', 'no_show'],
      in_progress: ['completed'],
    };
    if (!valid[appt.status]?.includes(status)) {
      throw new ConflictException(
        `No se puede pasar de "${appt.status}" a "${status}".`,
      );
    }

    try {
      await this.prisma.runAsActor(
        { actorId: user.userId, source: ActorSource.Staff },
        (tx) =>
          tx.appointments.updateMany({
            where: {
              id: appointmentId,
              clinic_id: user.clinicId,
              status: appt.status,
              deleted_at: null,
            },
            data: { status },
          }),
      );
    } catch (err) {
      throw this.mapManualWriteError(err);
    }

    const after = await this.prisma.appointments.findFirstOrThrow({
      where: { id: appointmentId, clinic_id: user.clinicId },
      select: SELECT,
    });

    return this.toResult(after);
  }

  private toResult(appt: {
    id: string;
    status: string;
    start_at: Date;
    end_at: Date;
  }): ConfirmAppointmentResult {
    return {
      id: appt.id,
      status: appt.status,
      start_at: appt.start_at.toISOString(),
      end_at: appt.end_at.toISOString(),
    };
  }

  /**
   * Mapea errores de BD al confirmar. Las reglas de agenda (disponibilidad,
   * prime time, secuencia, cool-down) y el no-solape raisean por trigger/EXCLUDE
   * y se re-chequean al pasar a 'confirmed'; si una carrera las viola, devolvemos
   * 409. Cualquier otro error cae a 500 con detalle SOLO en el log.
   */
  private mapWriteError(err: unknown): Error {
    const code = this.pgCode(err);
    // 23P01 exclusion (no-solape) · 23514 check (reglas de agenda).
    if (code === '23P01' || code === '23514') {
      return new ConflictException(
        'El turno dejó de cumplir las reglas de agenda y no se pudo confirmar.',
      );
    }
    this.logger.error(
      `[confirm] Error de BD no mapeado (code=${code ?? 'n/a'}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return new InternalServerErrorException(
      'Ocurrió un problema procesando la solicitud.',
    );
  }

  /**
   * Mapea errores de BD al alta manual. 23P01 = solape (el profesional ya tiene
   * un turno en ese rango). 23514 = check (orden de horario u otra regla). El
   * resto cae a 500 con detalle solo en el log.
   */
  private mapManualWriteError(err: unknown): Error {
    const code = this.pgCode(err);
    if (code === '23P01') {
      return new ConflictException(
        'El profesional ya tiene un turno que se solapa con ese horario.',
      );
    }
    if (code === '23514') {
      return new BadRequestException(
        'El turno no cumple las reglas de agenda.',
      );
    }
    this.logger.error(
      `[createManual] Error de BD no mapeado (code=${code ?? 'n/a'}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return new InternalServerErrorException(
      'Ocurrió un problema procesando la solicitud.',
    );
  }

  private pgCode(err: unknown): string | undefined {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      const metaCode = (err.meta as { code?: unknown } | undefined)?.code;
      if (typeof metaCode === 'string') return metaCode;
    }
    const code = (err as { code?: unknown } | undefined)?.code;
    return typeof code === 'string' ? code : undefined;
  }
}
