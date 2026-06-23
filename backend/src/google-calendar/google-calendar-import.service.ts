import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { GaxiosError } from 'gaxios';
import type { OAuth2Client } from 'google-auth-library';
import { professional_calendar_links } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { GoogleCalendarOAuthService } from './google-calendar-oauth.service';

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
 */
@Injectable()
export class GoogleCalendarImportService {
  private readonly logger = new Logger(GoogleCalendarImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: GoogleCalendarOAuthService,
  ) {}

  /** Sincroniza un profesional por su ID (para sync manual desde el controller). */
  async syncByProfessionalId(professionalId: string): Promise<void> {
    const link = await this.prisma.professional_calendar_links.findFirst({
      where: { professional_id: professionalId, is_active: true, deleted_at: null },
    });
    if (!link) return;
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
    const cal = google.calendar({ version: 'v3', auth: authClient as any });

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
