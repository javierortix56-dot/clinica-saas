import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user.interface';
import { GoogleCalendarOAuthService } from './google-calendar-oauth.service';
import { GoogleCalendarImportService } from './google-calendar-import.service';
import { GoogleCalendarWatchService } from './google-calendar-watch.service';

/**
 * Endpoints de Google Calendar.
 *
 * - GET /google-calendar/connect/:professionalId  → URL de OAuth (solo admin)
 * - GET /auth/google/callback                     → callback de OAuth (sin guard, viene de Google)
 * - DELETE /google-calendar/disconnect/:professionalId → desconectar (solo admin)
 * - POST /google-calendar/sync/:professionalId    → forzar sync manual (solo admin)
 */
@Controller()
export class GoogleCalendarController {
  constructor(
    private readonly oauth: GoogleCalendarOAuthService,
    private readonly importer: GoogleCalendarImportService,
    private readonly watch: GoogleCalendarWatchService,
    private readonly config: ConfigService,
  ) {}

  /** Devuelve la URL de autorización OAuth de Google para el profesional. */
  @Get('google-calendar/connect/:professionalId')
  @UseGuards(SupabaseJwtGuard, RolesGuard)
  @Roles('admin')
  async getConnectUrl(
    @Param('professionalId', ParseUUIDPipe) professionalId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ url: string }> {
    await this.oauth.validateProfessionalOwnership(professionalId, user.clinicId);
    const url = this.oauth.getAuthUrl(professionalId, user.clinicId);
    return { url };
  }

  /**
   * Callback OAuth de Google. No lleva JWT guard (el request viene de Google,
   * no del frontend). El profesionalId y clinicId vienen en el state firmado.
   */
  @Get('auth/google/callback')
  @Redirect()
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error?: string,
  ): Promise<{ url: string }> {
    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3001';
    if (error || !code) {
      return { url: `${frontendUrl}/staff?gcal_error=1` };
    }
    try {
      const professionalId = await this.oauth.handleCallback(code, state);
      // Registrar el canal de notificaciones push (tiempo real). Best-effort:
      // si falla (p.ej. dominio sin verificar) no bloquea la conexión; el poll
      // y el cron de renovación lo reintentan después.
      await this.watch.ensureChannel(professionalId).catch(() => undefined);
      return { url: `${frontendUrl}/staff?gcal_connected=1` };
    } catch (err) {
      return { url: `${frontendUrl}/staff?gcal_error=1` };
    }
  }

  /** Desconecta Google Calendar para un profesional. */
  @Delete('google-calendar/disconnect/:professionalId')
  @HttpCode(200)
  @UseGuards(SupabaseJwtGuard, RolesGuard)
  @Roles('admin')
  async disconnect(
    @Param('professionalId', ParseUUIDPipe) professionalId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ ok: boolean }> {
    await this.oauth.validateProfessionalOwnership(professionalId, user.clinicId);
    // Detener el canal push ANTES de borrar los tokens (stop necesita auth).
    await this.watch.stopChannel(professionalId).catch(() => undefined);
    await this.oauth.disconnect(professionalId, user.clinicId);
    return { ok: true };
  }

  /** Fuerza una sincronización inmediata Google→App para un profesional. */
  @Post('google-calendar/sync/:professionalId')
  @HttpCode(200)
  @UseGuards(SupabaseJwtGuard, RolesGuard)
  @Roles('admin')
  async forceSync(
    @Param('professionalId', ParseUUIDPipe) professionalId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ ok: boolean }> {
    await this.importer.syncByProfessionalId(professionalId, user.clinicId);
    return { ok: true };
  }
}
