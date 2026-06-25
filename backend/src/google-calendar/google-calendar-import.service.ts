import { Injectable, Logger } from '@nestjs/common';
import { calendar } from '@googleapis/calendar';
import { GaxiosError } from 'gaxios';
import type { OAuth2Client } from 'google-auth-library';
import { professional_calendar_links } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { GoogleCalendarOAuthService } from './google-calendar-oauth.service';

type CalClient = ReturnType<typeof calendar>;

/**
 * GoogleCalendarImportService — dirección Google Calendar → App.
 *
 * Lee eventos del calendario personal del profesional (source_calendar_id,
 * por defecto 'primary') e importa los bloqueos como availability_exceptions.
 * Usa sync incremental con syncToken para minimizar lecturas a la API de Google.
 *
 * Anti-loop: la escritura (App→Google) va al target_calendar_id; la lectura
 * (Google→App) viene del source_calendar_id. Son calendarios distintos, así
 * que los eventos importados no vuelven a disparar la lectura.
 *
 * Cancelación inversa: además de importar bloqueos, verifica que los eventos
 * de turno en target_calendar_id sigan existiendo. Si el profesional eliminó
 * un evento en Google Calendar, el turno correspondiente se cancela en la app.
 */
@Injectable()
export class GoogleCalendarImportService {
  private readonly logger = new Logger(GoogleCalendarImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: GoogleCalendarOAuthService,
  ) {}

  /** Sincroniza un profesional por su ID (para sync manual desde el controller). */
  async syncByProfessionalId(professionalId: string, clinicId?: string): Promise<void> {
    const link = await this.prisma.professional_calendar_links.findFirst({
      where: { professional_id: professionalId, is_active: true, deleted_at: null },
      include: { professionals: { select: { clinic_id: true } } },
    });
    if (!link) return;
    if (clinicId && link.professionals?.clinic_id !== clinicId) return;
    await this.syncProfessional(link);
  }

  /** Sincroniza todos los profesionales con Google Calendar activo. */
  async syncAll(): Promise<void> {
    const links = await this.prisma.professional_calendar_links.findMany({
      where: { is_active: true, deleted_at: null },
    });

    // allSettled: un error en un profesional no cancela los demás.
    const results = await Promise.allSettled(
      links.map((link) => this.syncProfessional(link)),
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      this.logger.warn(`${failed}/${links.length} sincronizaciones fallaron.`);
    }
  }

  /** Sincroniza un profesional usando incremental sync con syncToken. */
  async syncProfessional(
    link: professional_calendar_links,
  ): Promise<void> {
    const sourceCalId = link.source_calendar_id ?? 'primary';

    const authClient = await this.oauth.getAuthClient(link.professional_id);
    if (!authClient) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cal = calendar({ version: 'v3', auth: authClient as any });

    let syncToken = link.sync_token ?? undefined;
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;

    do {
      try {
        const res = await cal.events.list({
          calendarId: sourceCalId,
          syncToken: pageToken ? undefined : syncToken,
          pageToken,
          singleEvents: true,
          // Sin syncToken => full sync; limitamos al último año hacia adelante.
          ...(syncToken
            ? {}
            : { timeMin: new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString() }),
        });

        const events = res.data.items ?? [];
        for (const event of events) {
          if (!event.id) continue;
          if (event.status === 'cancelled') {
            await this.removeException(link.professional_id, event.id);
          } else {
            await this.upsertException(link, event);
          }
        }

        pageToken = res.data.nextPageToken ?? undefined;
        if (!pageToken && res.data.nextSyncToken) {
          nextSyncToken = res.data.nextSyncToken;
        }
      } catch (err) {
        if ((err as GaxiosError)?.response?.status === 410) {
          // syncToken expiró — reiniciar con full sync.
          this.logger.warn(
            `syncToken expirado para professional ${link.professional_id}. Full sync.`,
          );
          await this.prisma.professional_calendar_links.update({
            where: { id: link.id },
            data: { sync_token: null },
          });
          await this.syncProfessional({ ...link, sync_token: null });
          return;
        }
        throw err;
      }
    } while (pageToken);

    if (nextSyncToken) {
      await this.prisma.professional_calendar_links.update({
        where: { id: link.id },
        data: { sync_token: nextSyncToken, last_synced_at: new Date() },
      });
    }

    // Cancelación inversa: verifica que los eventos de turno en target_calendar_id
    // sigan existiendo. Si el profesional eliminó uno, cancela el turno en la app.
    if (link.target_calendar_id) {
      await this.syncCancelledAppointments(link, cal);
    }
  }

  /**
   * Reconcilia cancelaciones para un link puntual (disparado por webhook push).
   * Construye su propio cliente de calendario y verifica los turnos del
   * profesional contra Google. Público para que el watch service lo invoque
   * en tiempo real cuando Google notifica un cambio.
   */
  async reconcileCancellationsForLink(
    link: professional_calendar_links,
  ): Promise<void> {
    if (!link.target_calendar_id) return;

    const authClient = await this.oauth.getAuthClient(link.professional_id);
    if (!authClient) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cal = calendar({ version: 'v3', auth: authClient as any });
    await this.syncCancelledAppointments(link, cal);
  }

  /**
   * Para cada turno confirmado con google_event_id, verifica si el evento
   * todavía existe en target_calendar_id. Si fue eliminado (404 o status
   * 'cancelled'), cancela el turno en la app y limpia el google_event_id.
   */
  private async syncCancelledAppointments(
    link: professional_calendar_links,
    cal: CalClient,
  ): Promise<void> {
    const appts = await this.prisma.appointments.findMany({
      where: {
        professional_id: link.professional_id,
        google_event_id: { not: null },
        status: { in: ['proposed', 'confirmed', 'in_progress'] },
        deleted_at: null,
      },
      select: { id: true, google_event_id: true },
    });

    await Promise.allSettled(
      appts.map(async (appt) => {
        try {
          const eventRes = await cal.events.get({
            calendarId: link.target_calendar_id!,
            eventId: appt.google_event_id!,
          });
          if (eventRes.data.status === 'cancelled') {
            await this.cancelFromGCal(appt.id);
          }
        } catch (err) {
          const status = (err as GaxiosError)?.response?.status;
          if (status === 404 || status === 410) {
            await this.cancelFromGCal(appt.id);
          } else {
            this.logger.warn(
              `No se pudo verificar evento ${appt.google_event_id} en GCal: ${String(err)}`,
            );
          }
        }
      }),
    );
  }

  /** Cancela un turno que fue eliminado desde Google Calendar. */
  private async cancelFromGCal(appointmentId: string): Promise<void> {
    const count = await this.prisma.appointments.updateMany({
      where: {
        id: appointmentId,
        status: { notIn: ['cancelled', 'completed'] },
        deleted_at: null,
      },
      data: { status: 'cancelled', google_event_id: null },
    });
    if (count.count > 0) {
      this.logger.log(
        `Turno ${appointmentId} cancelado porque su evento fue eliminado de Google Calendar`,
      );
    }
  }

  private async upsertException(
    link: professional_calendar_links,
    event: { id?: string | null; summary?: string | null; start?: { dateTime?: string | null }; end?: { dateTime?: string | null } },
  ): Promise<void> {
    if (!event.id || !event.start?.dateTime || !event.end?.dateTime) return;

    const startsAt = new Date(event.start.dateTime);
    const endsAt = new Date(event.end.dateTime);

    const existing = await this.prisma.availability_exceptions.findFirst({
      where: {
        professional_id: link.professional_id,
        external_event_id: event.id,
        deleted_at: null,
      },
    });

    if (existing) {
      await this.prisma.availability_exceptions.update({
        where: { id: existing.id },
        data: {
          starts_at: startsAt,
          ends_at: endsAt,
          reason: event.summary ?? null,
        },
      });
    } else {
      await this.prisma.availability_exceptions.create({
        data: {
          clinic_id: link.clinic_id,
          professional_id: link.professional_id,
          kind: 'block',
          starts_at: startsAt,
          ends_at: endsAt,
          reason: event.summary ?? null,
          source: 'google_calendar',
          external_event_id: event.id,
        },
      });
    }
  }

  private async removeException(
    professionalId: string,
    externalEventId: string,
  ): Promise<void> {
    await this.prisma.availability_exceptions.updateMany({
      where: {
        professional_id: professionalId,
        external_event_id: externalEventId,
        deleted_at: null,
      },
      data: { deleted_at: new Date() },
    });
  }
}
