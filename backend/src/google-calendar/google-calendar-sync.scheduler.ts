import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GoogleCalendarImportService } from './google-calendar-import.service';
import { GoogleCalendarWatchService } from './google-calendar-watch.service';

/**
 * Scheduler de Google Calendar.
 *
 * - Poll cada 2 min (red de seguridad): importa bloqueos y reconcilia
 *   cancelaciones por si se perdió alguna notificación push.
 * - Renovación de watch channels cada hora: registra canales faltantes y
 *   renueva los que están por expirar, para mantener vivas las notificaciones
 *   en tiempo real Google → App.
 */
@Injectable()
export class GoogleCalendarSyncScheduler {
  private readonly logger = new Logger(GoogleCalendarSyncScheduler.name);

  constructor(
    private readonly importer: GoogleCalendarImportService,
    private readonly watch: GoogleCalendarWatchService,
  ) {}

  @Cron('*/2 * * * *')
  async syncGoogleToApp(): Promise<void> {
    this.logger.debug('Iniciando sync Google Calendar → App');
    try {
      await this.importer.syncAll();
    } catch (err) {
      this.logger.error(`Error en sync Google Calendar: ${String(err)}`);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async renewWatchChannels(): Promise<void> {
    this.logger.debug('Verificando watch channels de Google Calendar');
    try {
      await this.watch.ensureAllChannels();
    } catch (err) {
      this.logger.error(`Error renovando watch channels: ${String(err)}`);
    }
  }
}
