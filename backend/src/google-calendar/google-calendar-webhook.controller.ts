import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { GoogleCalendarWatchService } from './google-calendar-watch.service';

/**
 * Webhook de Google Calendar (notificaciones push). Sin guard de JWT: el request
 * viene de Google, no del frontend. La autenticidad se valida con el token del
 * canal (X-Goog-Channel-Token) contra el guardado al registrar el watch.
 *
 * También sirve el archivo de verificación de dominio que pide Google Cloud
 * Console (Domain verification) para autorizar este dominio como receptor de
 * notificaciones push.
 */
@Controller()
export class GoogleCalendarWebhookController {
  private readonly logger = new Logger(GoogleCalendarWebhookController.name);

  constructor(
    private readonly watch: GoogleCalendarWatchService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Recibe las notificaciones de cambios. El cuerpo viene vacío; la info está
   * en los headers. Respondemos 200 inmediato y procesamos en segundo plano
   * para no demorar a Google (que reintenta si tarda).
   */
  @Post('google-calendar/webhook')
  @HttpCode(200)
  receive(
    @Headers('x-goog-channel-id') channelId: string | undefined,
    @Headers('x-goog-resource-state') resourceState: string | undefined,
    @Headers('x-goog-channel-token') token: string | undefined,
  ): { ok: boolean } {
    // Primer mensaje tras registrar el canal: handshake, sin cambios reales.
    if (resourceState === 'sync' || !channelId) {
      return { ok: true };
    }

    // No bloquear la respuesta a Google: reconciliar en segundo plano.
    void this.watch
      .handleNotification(channelId, token)
      .catch((err: unknown) =>
        this.logger.error(`Error procesando webhook GCal: ${String(err)}`),
      );

    return { ok: true };
  }

  /**
   * Sirve el archivo de verificación de dominio de Google (método "HTML file"
   * de Search Console). Google pide GET /google<hash>.html con contenido
   * `google-site-verification: google<hash>.html`.
   *
   * El nombre del archivo se configura en GOOGLE_SITE_VERIFICATION (el nombre
   * completo, p.ej. "google1a2b3c4d.html"). La ruta solo matchea paths que
   * empiezan con el literal "google", así que no interfiere con otras rutas.
   */
  @Get('google:token')
  serveSiteVerification(
    @Param('token') token: string,
    @Res() res: Response,
  ): void {
    const expected = this.config.get<string>('GOOGLE_SITE_VERIFICATION');
    const filename = `google${token}`;
    if (expected && filename === expected) {
      res.type('text/html').send(`google-site-verification: ${expected}`);
      return;
    }
    res.status(404).send('Not found');
  }
}
