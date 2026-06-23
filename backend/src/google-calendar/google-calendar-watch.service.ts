import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { calendar } from '@googleapis/calendar';
import { professional_calendar_links } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { GoogleCalendarOAuthService } from './google-calendar-oauth.service';
import { GoogleCalendarImportService } from './google-calendar-import.service';

/**
 * GoogleCalendarWatchService — notificaciones push (tiempo real) Google → App.
 *
 * Registra un "watch channel" sobre el target_calendar_id de cada profesional
 * (el calendario "Turnos - ..."). Google hace un POST a /google-calendar/webhook
 * cada vez que ese calendario cambia; el backend reconcilia los turnos al
 * instante (si el profesional borró el evento, cancela el turno).
 *
 * Los canales expiran, así que se renuevan con un cron antes del vencimiento.
 * El poll cada 10 min sigue activo como red de seguridad por si se pierde un
 * webhook o el canal caduca entre renovaciones.
 *
 * REQUISITO DE GOOGLE: el dominio que recibe el webhook debe estar verificado
 * en Google Cloud Console (Domain verification). Si no lo está, events.watch
 * devuelve 401 y el registro falla — se loguea y se sigue con el poll.
 */
@Injectable()
export class GoogleCalendarWatchService {
  private readonly logger = new Logger(GoogleCalendarWatchService.name);

  // Renovamos cuando faltan menos de 24 h para el vencimiento.
  private static readonly RENEW_MARGIN_MS = 24 * 60 * 60 * 1000;
  // TTL solicitado (segundos). Google puede acotarlo; usamos su expiration real.
  private static readonly REQUESTED_TTL_SECONDS = '2592000'; // 30 días

  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: GoogleCalendarOAuthService,
    private readonly importer: GoogleCalendarImportService,
    private readonly config: ConfigService,
  ) {}

  /**
   * URL pública del webhook. Se toma de GOOGLE_WEBHOOK_URL si está seteada;
   * si no, se deriva del origin de GOOGLE_REDIRECT_URI (mismo dominio del
   * backend) + /google-calendar/webhook. Devuelve null si no se puede derivar.
   */
  private webhookUrl(): string | null {
    const explicit = this.config.get<string>('GOOGLE_WEBHOOK_URL');
    if (explicit) return explicit;

    const redirect = this.config.get<string>('GOOGLE_REDIRECT_URI');
    if (!redirect) return null;
    try {
      return `${new URL(redirect).origin}/google-calendar/webhook`;
    } catch {
      return null;
    }
  }

  /**
   * Registra (o re-registra) el canal de notificaciones para un profesional.
   * Detiene el canal anterior si existía. Best-effort: ante cualquier error de
   * Google (típicamente dominio sin verificar) loguea y no propaga.
   */
  async ensureChannel(professionalId: string): Promise<void> {
    const link = await this.prisma.professional_calendar_links.findFirst({
      where: { professional_id: professionalId, is_active: true, deleted_at: null },
    });
    if (!link?.target_calendar_id) return;

    const url = this.webhookUrl();
    if (!url) {
      this.logger.warn(
        'No se puede registrar watch: falta GOOGLE_WEBHOOK_URL/GOOGLE_REDIRECT_URI.',
      );
      return;
    }

    const authClient = await this.oauth.getAuthClient(professionalId);
    if (!authClient) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cal = calendar({ version: 'v3', auth: authClient as any });

    // Detener el canal previo (si lo había) para no acumular canales huérfanos.
    await this.stopChannelOnGoogle(cal, link);

    const channelId = randomUUID();
    const token = randomUUID();

    try {
      const res = await cal.events.watch({
        calendarId: link.target_calendar_id,
        requestBody: {
          id: channelId,
          type: 'web_hook',
          address: url,
          token,
          params: { ttl: GoogleCalendarWatchService.REQUESTED_TTL_SECONDS },
        },
      });

      const expiration = res.data.expiration
        ? new Date(Number(res.data.expiration))
        : null;

      await this.prisma.professional_calendar_links.update({
        where: { id: link.id },
        data: {
          watch_channel_id: channelId,
          watch_resource_id: res.data.resourceId ?? null,
          watch_token: token,
          watch_expiration: expiration,
        },
      });

      this.logger.log(
        `Watch registrado para professional ${professionalId} ` +
          `(expira ${expiration?.toISOString() ?? 'n/d'}).`,
      );
    } catch (err) {
      this.logger.error(
        `No se pudo registrar watch para professional ${professionalId}: ${String(err)}. ` +
          'Verificá que el dominio del webhook esté validado en Google Cloud Console. ' +
          'El poll cada 10 min sigue funcionando como respaldo.',
      );
    }
  }

  /**
   * Detiene el canal de un profesional en Google y limpia los campos watch_*.
   * Se llama al desconectar Google Calendar (antes de borrar los tokens).
   */
  async stopChannel(professionalId: string): Promise<void> {
    const link = await this.prisma.professional_calendar_links.findFirst({
      where: { professional_id: professionalId },
    });
    if (!link?.watch_channel_id) return;

    const authClient = await this.oauth.getAuthClient(professionalId);
    if (authClient) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cal = calendar({ version: 'v3', auth: authClient as any });
      await this.stopChannelOnGoogle(cal, link);
    }

    await this.prisma.professional_calendar_links.update({
      where: { id: link.id },
      data: {
        watch_channel_id: null,
        watch_resource_id: null,
        watch_token: null,
        watch_expiration: null,
      },
    });
  }

  /** Stop best-effort de un canal en Google (no propaga errores). */
  private async stopChannelOnGoogle(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cal: any,
    link: professional_calendar_links,
  ): Promise<void> {
    if (!link.watch_channel_id || !link.watch_resource_id) return;
    try {
      await cal.channels.stop({
        requestBody: {
          id: link.watch_channel_id,
          resourceId: link.watch_resource_id,
        },
      });
    } catch (err) {
      this.logger.debug(`channels.stop falló (ignorado): ${String(err)}`);
    }
  }

  /**
   * Maneja una notificación push entrante. Busca el link por channelId, valida
   * el token y reconcilia las cancelaciones del profesional. Idempotente.
   */
  async handleNotification(
    channelId: string,
    token: string | undefined,
  ): Promise<void> {
    const link = await this.prisma.professional_calendar_links.findFirst({
      where: { watch_channel_id: channelId, is_active: true, deleted_at: null },
    });
    if (!link) {
      this.logger.warn(`Webhook para canal desconocido: ${channelId}`);
      return;
    }
    if (!link.watch_token || link.watch_token !== token) {
      this.logger.warn(`Token de canal inválido para ${channelId}; se ignora.`);
      return;
    }

    await this.importer.reconcileCancellationsForLink(link);
  }

  /**
   * Registra canales faltantes y renueva los que están por expirar. Lo llama
   * el cron periódico. También cubre profesionales conectados antes de existir
   * esta feature (canal nulo).
   */
  async ensureAllChannels(): Promise<void> {
    const links = await this.prisma.professional_calendar_links.findMany({
      where: {
        is_active: true,
        deleted_at: null,
        target_calendar_id: { not: null },
      },
    });

    const renewBefore = new Date(
      Date.now() + GoogleCalendarWatchService.RENEW_MARGIN_MS,
    );

    for (const link of links) {
      const needsChannel =
        !link.watch_channel_id ||
        !link.watch_expiration ||
        link.watch_expiration < renewBefore;
      if (needsChannel) {
        await this.ensureChannel(link.professional_id);
      }
    }
  }
}
