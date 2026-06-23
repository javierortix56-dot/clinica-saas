import { Injectable, Logger } from '@nestjs/common';
import { calendar } from '@googleapis/calendar';
import type { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../database/prisma.service';
import { GoogleCalendarOAuthService } from './google-calendar-oauth.service';

/**
 * GoogleCalendarEventService — dirección App → Google Calendar.
 *
 * Crea, actualiza o elimina eventos en el calendario "Turnos" del profesional
 * cuando un turno cambia de estado en la app. Si el profesional no tiene
 * Google Calendar conectado, las operaciones son no-op silenciosos.
 */
@Injectable()
export class GoogleCalendarEventService {
  private readonly logger = new Logger(GoogleCalendarEventService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: GoogleCalendarOAuthService,
  ) {}

  /** Crea o actualiza el evento en Google Calendar para un turno confirmado. */
  async upsertEvent(appointmentId: string): Promise<void> {
    const appt = await this.prisma.appointments.findFirst({
      where: { id: appointmentId, deleted_at: null },
      include: {
        patients: { select: { full_name: true } },
        professionals: {
          include: { staff_members: { select: { full_name: true } } },
        },
        treatments: {
          include: { treatment_types: { select: { name: true } } },
        },
        treatment_phase_templates: { select: { name: true } },
      },
    });
    if (!appt) return;

    const link = await this.prisma.professional_calendar_links.findFirst({
      where: {
        professional_id: appt.professional_id,
        is_active: true,
        deleted_at: null,
      },
    });
    if (!link?.target_calendar_id) return;

    const authClient = await this.oauth.getAuthClient(appt.professional_id);
    if (!authClient) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cal = calendar({ version: 'v3', auth: authClient as any });
    const treatmentLabel =
      appt.treatments?.treatment_types?.name ??
      appt.treatment_phase_templates?.name ??
      null;

    const eventBody = {
      summary: `Turno: ${appt.patients.full_name}`,
      description: [
        treatmentLabel ? `Tratamiento: ${treatmentLabel}` : null,
        `Profesional: ${appt.professionals.staff_members?.full_name ?? '—'}`,
      ]
        .filter(Boolean)
        .join('\n'),
      start: { dateTime: appt.start_at.toISOString() },
      end: { dateTime: appt.end_at.toISOString() },
    };

    try {
      if (appt.google_event_id) {
        await cal.events.update({
          calendarId: link.target_calendar_id,
          eventId: appt.google_event_id,
          requestBody: eventBody,
        });
        this.logger.debug(`Evento actualizado en GCal: ${appt.google_event_id}`);
      } else {
        const res = await cal.events.insert({
          calendarId: link.target_calendar_id,
          requestBody: eventBody,
        });
        const eventId = res.data.id;
        if (eventId) {
          await this.prisma.appointments.update({
            where: { id: appointmentId },
            data: { google_event_id: eventId },
          });
          this.logger.debug(`Evento creado en GCal: ${eventId}`);
        }
      }
    } catch (err) {
      // No bloquear el flujo de confirmación por error de GCal.
      this.logger.error(
        `Error sincronizando turno ${appointmentId} con GCal: ${String(err)}`,
      );
    }
  }

  /** Elimina el evento en Google Calendar cuando un turno es cancelado. */
  async deleteEvent(appointmentId: string): Promise<void> {
    const appt = await this.prisma.appointments.findFirst({
      where: { id: appointmentId, deleted_at: null },
    });
    if (!appt?.google_event_id) return;

    const link = await this.prisma.professional_calendar_links.findFirst({
      where: {
        professional_id: appt.professional_id,
        is_active: true,
        deleted_at: null,
      },
    });
    if (!link?.target_calendar_id) return;

    const authClient = await this.oauth.getAuthClient(appt.professional_id);
    if (!authClient) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cal = calendar({ version: 'v3', auth: authClient as any });
    try {
      await cal.events.delete({
        calendarId: link.target_calendar_id,
        eventId: appt.google_event_id,
      });
      await this.prisma.appointments.update({
        where: { id: appointmentId },
        data: { google_event_id: null },
      });
      this.logger.debug(
        `Evento eliminado de GCal: ${appt.google_event_id}`,
      );
    } catch (err) {
      this.logger.error(
        `Error eliminando evento ${appt.google_event_id} de GCal: ${String(err)}`,
      );
    }
  }
}
