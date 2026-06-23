import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { calendar } from '@googleapis/calendar';
import { OAuth2Client, Credentials } from 'google-auth-library';
import { PrismaService } from '../database/prisma.service';
import { VaultService } from './vault.service';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
];

@Injectable()
export class GoogleCalendarOAuthService {
  private readonly logger = new Logger(GoogleCalendarOAuthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: VaultService,
    private readonly config: ConfigService,
  ) {
    // Las vars son opcionales en startup; se leen de forma lazy en makeClient().
    this.clientId = config.get<string>('GOOGLE_CLIENT_ID') ?? '';
    this.clientSecret = config.get<string>('GOOGLE_CLIENT_SECRET') ?? '';
    this.redirectUri = config.get<string>('GOOGLE_REDIRECT_URI') ?? '';
  }

  private makeClient(): OAuth2Client {
    if (!this.clientId || !this.clientSecret) {
      throw new Error(
        'Google Calendar no está configurado. ' +
          'Asegurate de setear GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y GOOGLE_REDIRECT_URI.',
      );
    }
    return new OAuth2Client(this.clientId, this.clientSecret, this.redirectUri);
  }

  /**
   * Genera la URL de autorización OAuth. `state` codifica professionalId +
   * clinicId en base64 para recuperarlos en el callback sin necesidad de
   * sesión en el backend.
   */
  getAuthUrl(professionalId: string, clinicId: string): string {
    const client = this.makeClient();
    const state = Buffer.from(
      JSON.stringify({ professionalId, clinicId }),
    ).toString('base64url');

    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
      state,
    });
  }

  /**
   * Callback de OAuth: intercambia el code por tokens, crea un calendario
   * dedicado "Turnos - [nombre]" en Google, guarda tokens en Vault y registra
   * el link en professional_calendar_links.
   */
  async handleCallback(code: string, rawState: string): Promise<string> {
    let professionalId: string;
    let clinicId: string;
    try {
      const parsed = JSON.parse(
        Buffer.from(rawState, 'base64url').toString(),
      ) as { professionalId: string; clinicId: string };
      professionalId = parsed.professionalId;
      clinicId = parsed.clinicId;
    } catch {
      throw new UnauthorizedException('Estado OAuth inválido.');
    }

    const client = this.makeClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      this.logger.warn(
        `OAuth callback para professional ${professionalId} sin refresh_token. ` +
          'El profesional debe revocar el acceso en su cuenta Google y reconectar.',
      );
    }

    // Crear calendario dedicado para turnos si no existía antes.
    client.setCredentials(tokens);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cal = calendar({ version: 'v3', auth: client as any });

    let targetCalendarId: string;
    try {
      // Buscar si ya existe uno con ese nombre para evitar duplicados.
      const prof = await this.prisma.professionals.findFirst({
        where: { id: professionalId },
        include: { staff_members: { select: { full_name: true } } },
      });
      const calName = `Turnos - ${prof?.staff_members?.full_name ?? 'Profesional'}`;

      const listRes = await cal.calendarList.list();
      const existing = listRes.data.items?.find((c) => c.summary === calName);

      if (existing?.id) {
        targetCalendarId = existing.id;
      } else {
        const newCal = await cal.calendars.insert({
          requestBody: { summary: calName },
        });
        targetCalendarId = newCal.data.id!;
      }
    } catch (err) {
      this.logger.error(`Error creando calendario: ${String(err)}`);
      // Si falla, usamos 'primary' como fallback.
      targetCalendarId = 'primary';
    }

    // Guardar tokens en Vault.
    const existing = await this.prisma.professional_calendar_links.findUnique({
      where: { professional_id: professionalId },
    });

    const tokenJson = JSON.stringify(tokens);
    let secretRef: string;

    if (existing?.oauth_secret_ref) {
      await this.vault.updateSecret(existing.oauth_secret_ref, tokenJson);
      secretRef = existing.oauth_secret_ref;
    } else {
      secretRef = await this.vault.createSecret(
        tokenJson,
        `gcal_prof_${professionalId}`,
      );
    }

    await this.prisma.professional_calendar_links.upsert({
      where: { professional_id: professionalId },
      create: {
        clinic_id: clinicId,
        professional_id: professionalId,
        oauth_secret_ref: secretRef,
        target_calendar_id: targetCalendarId,
        source_calendar_id: 'primary',
        is_active: true,
      },
      update: {
        oauth_secret_ref: secretRef,
        target_calendar_id: targetCalendarId,
        source_calendar_id: 'primary',
        is_active: true,
        sync_token: null,
      },
    });

    this.logger.log(
      `Google Calendar conectado para professional ${professionalId}`,
    );

    return professionalId;
  }

  /**
   * Devuelve un OAuth2Client autenticado para el profesional, refrescando el
   * access_token si expiró. Devuelve null si no hay conexión activa.
   */
  async getAuthClient(
    professionalId: string,
  ): Promise<OAuth2Client | null> {
    const link = await this.prisma.professional_calendar_links.findFirst({
      where: { professional_id: professionalId, is_active: true, deleted_at: null },
    });
    if (!link?.oauth_secret_ref) return null;

    const raw = await this.vault.readSecret(link.oauth_secret_ref);
    if (!raw) return null;

    let tokens: Credentials;
    try {
      tokens = JSON.parse(raw) as Credentials;
    } catch {
      return null;
    }

    const client = this.makeClient();
    client.setCredentials(tokens);

    // Refrescar si el token está por expirar (margen 5 min).
    if (
      tokens.expiry_date &&
      tokens.expiry_date < Date.now() + 5 * 60 * 1000
    ) {
      try {
        const { credentials } = await client.refreshAccessToken();
        client.setCredentials(credentials);
        await this.vault.updateSecret(
          link.oauth_secret_ref,
          JSON.stringify(credentials),
        );
      } catch (err) {
        this.logger.warn(
          `No se pudo refrescar token para professional ${professionalId}: ${String(err)}`,
        );
        return null;
      }
    }

    return client;
  }

  /** Desconecta Google Calendar para un profesional. */
  async disconnect(professionalId: string, clinicId: string): Promise<void> {
    const link = await this.prisma.professional_calendar_links.findFirst({
      where: { professional_id: professionalId, clinic_id: clinicId },
    });

    if (link?.oauth_secret_ref) {
      await this.vault.deleteSecret(link.oauth_secret_ref);
    }

    if (link) {
      await this.prisma.professional_calendar_links.update({
        where: { id: link.id },
        data: { is_active: false, oauth_secret_ref: null, sync_token: null },
      });
    }

    this.logger.log(
      `Google Calendar desconectado para professional ${professionalId}`,
    );
  }
}
