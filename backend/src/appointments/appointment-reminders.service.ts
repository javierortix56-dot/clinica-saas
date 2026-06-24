import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

const HOUR_MS = 60 * 60 * 1000;
const TZ = 'America/Argentina/Buenos_Aires';

/** Una de las dos ventanas de recordatorio. */
type ReminderKind = '24h' | '4h';

/**
 * AppointmentRemindersService — recordatorios proactivos por WhatsApp.
 *
 * Cron cada 15 min: busca turnos CONFIRMADOS que entran en la ventana de
 * recordatorio (~24h antes y ~4h antes) y todavía no fueron notificados, y
 * envía una plantilla pre-aprobada de Meta (obligatoria fuera de la ventana de
 * 24h de conversación). Marca `reminder_24h_sent_at` / `reminder_4h_sent_at`
 * para idempotencia: nunca se manda dos veces el mismo recordatorio.
 *
 * Si las plantillas no están configuradas (env vacío), el cron no hace nada:
 * la feature queda inerte hasta que se carguen los nombres de plantilla.
 */
@Injectable()
export class AppointmentRemindersService {
  private readonly logger = new Logger(AppointmentRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    private readonly config: ConfigService,
  ) {}

  // Cada 15 minutos (min 0,15,30,45 de cada hora).
  @Cron('0 */15 * * * *')
  async sendDueReminders(): Promise<void> {
    const lang = this.config.get<string>('WHATSAPP_REMINDER_TEMPLATE_LANG');
    const tpl24h = this.config.get<string>('WHATSAPP_REMINDER_TEMPLATE_24H');
    const tpl4h = this.config.get<string>('WHATSAPP_REMINDER_TEMPLATE_4H');

    if (!lang || (!tpl24h && !tpl4h)) {
      // Feature no configurada todavía: no hacemos nada (sin ruido).
      return;
    }

    try {
      if (tpl24h) await this.processWindow('24h', tpl24h, lang);
      if (tpl4h) await this.processWindow('4h', tpl4h, lang);
    } catch (err) {
      this.logger.error(`Error enviando recordatorios: ${String(err)}`);
    }
  }

  /**
   * Procesa una ventana de recordatorio. Selecciona turnos confirmados cuyo
   * `start_at` cruzó el umbral correspondiente y aún no recibieron este
   * recordatorio, y envía la plantilla.
   *
   * Ventanas (con `now` = ahora):
   *   24h → start_at en (now+4h, now+24h]: ya está a menos de 24h pero a más de
   *         4h (los de <4h los cubre la ventana 4h, evitando doble disparo).
   *   4h  → start_at en (now, now+4h]: a menos de 4h y todavía futuro.
   */
  private async processWindow(
    kind: ReminderKind,
    templateName: string,
    lang: string,
  ): Promise<void> {
    const now = new Date();
    const sentField =
      kind === '24h' ? 'reminder_24h_sent_at' : 'reminder_4h_sent_at';

    const lowerMs = kind === '24h' ? 4 * HOUR_MS : 0;
    const upperMs = kind === '24h' ? 24 * HOUR_MS : 4 * HOUR_MS;

    const appts = await this.prisma.appointments.findMany({
      where: {
        status: 'confirmed',
        deleted_at: null,
        [sentField]: null,
        start_at: {
          gt: new Date(now.getTime() + lowerMs),
          lte: new Date(now.getTime() + upperMs),
        },
      },
      select: {
        id: true,
        clinic_id: true,
        start_at: true,
        patients: { select: { full_name: true, phone: true } },
        professionals: {
          select: { staff_members: { select: { full_name: true } } },
        },
      },
    });

    if (appts.length === 0) return;

    // phone_number_id por clínica (cache para no repetir queries).
    const phoneNumberIdByClinic = new Map<string, string | null>();

    for (const appt of appts) {
      const phone = normalizePhone(appt.patients?.phone);
      if (!phone) {
        // Sin teléfono no se puede notificar; marcamos enviado para no
        // reintentar en cada corrida (con log para visibilidad).
        await this.stamp(appt.id, sentField);
        this.logger.warn(
          `Turno ${appt.id} sin teléfono de paciente; recordatorio ${kind} omitido.`,
        );
        continue;
      }

      if (!phoneNumberIdByClinic.has(appt.clinic_id)) {
        const channel = await this.prisma.whatsapp_channels.findFirst({
          where: {
            clinic_id: appt.clinic_id,
            is_active: true,
            deleted_at: null,
          },
          select: { phone_number_id: true },
        });
        phoneNumberIdByClinic.set(
          appt.clinic_id,
          channel?.phone_number_id ?? null,
        );
      }
      const phoneNumberId = phoneNumberIdByClinic.get(appt.clinic_id);
      if (!phoneNumberId) {
        this.logger.warn(
          `Clínica ${appt.clinic_id} sin canal de WhatsApp activo; recordatorio ${kind} omitido.`,
        );
        continue;
      }

      const patientName = appt.patients?.full_name ?? 'paciente';
      const professionalName =
        appt.professionals?.staff_members?.full_name ?? 'el profesional';
      const fecha = formatDate(appt.start_at);
      const hora = formatTime(appt.start_at);

      try {
        await this.whatsapp.sendTemplate(
          phone,
          templateName,
          lang,
          [patientName, fecha, hora, professionalName],
          phoneNumberId,
        );
        // Marca DESPUÉS del envío exitoso: si falla, se reintenta la próxima
        // corrida (a costa de un posible reenvío si el envío salió pero la
        // marca falló; el riesgo es mínimo y preferible a no recordar).
        await this.stamp(appt.id, sentField);
        this.logger.log(
          `Recordatorio ${kind} enviado para turno ${appt.id} a ${phone}.`,
        );
      } catch (err) {
        this.logger.error(
          `Falló recordatorio ${kind} para turno ${appt.id}: ${String(err)}`,
        );
        // No marcamos: reintento en la próxima corrida.
      }
    }
  }

  private async stamp(
    appointmentId: string,
    field: 'reminder_24h_sent_at' | 'reminder_4h_sent_at',
  ): Promise<void> {
    await this.prisma.appointments.update({
      where: { id: appointmentId },
      data: { [field]: new Date() },
    });
  }
}

/** Deja solo dígitos (Meta espera E.164 sin '+'). Devuelve null si queda vacío. */
function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
}

/** Fecha legible en zona Buenos Aires, ej: "martes 30/06". */
function formatDate(d: Date): string {
  const weekday = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    timeZone: TZ,
  }).format(d);
  const dayMonth = new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: TZ,
  }).format(d);
  return `${weekday} ${dayMonth}`;
}

/** Hora legible en zona Buenos Aires, ej: "10:00". */
function formatTime(d: Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TZ,
  }).format(d);
}
