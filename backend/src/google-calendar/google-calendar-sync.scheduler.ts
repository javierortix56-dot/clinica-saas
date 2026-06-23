import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GoogleCalendarImportService } from './google-calendar-import.service';

/**
 * Scheduler que ejecuta la sincronización Google→App cada 15 minutos.
 * Lee eventos del calendario personal de cada profesional conectado e importa
 * los bloqueos como availability_exceptions.
 */
@Injectable()
export class GoogleCalendarSyncScheduler {
  private readonly logger = new Logger(GoogleCalendarSyncScheduler.name);

  constructor(private readonly importer: GoogleCalendarImportService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async syncGoogleToApp(): Promise<void> {
    this.logger.debug('Iniciando sync Google Calendar → App');
    try {
      await this.importer.syncAll();
    } catch (err) {
      this.logger.error(`Error en sync Google Calendar: ${String(err)}`);
    }
  }
}
