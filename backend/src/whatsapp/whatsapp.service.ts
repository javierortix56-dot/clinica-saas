import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  WHATSAPP_INCOMING_QUEUE,
  WhatsappIncomingJob,
} from '../queue/queue.constants';

const GRAPH_API_BASE = 'https://graph.facebook.com';
const GRAPH_API_VERSION = 'v21.0';

/** Respuesta típica de la Cloud API al enviar un mensaje. */
export interface WhatsappSendResult {
  messaging_product?: string;
  contacts?: { input: string; wa_id: string }[];
  messages?: { id: string }[];
  error?: unknown;
}

/**
 * Cliente para la WhatsApp Cloud API (Meta) + punto de entrada del procesamiento
 * de eventos entrantes. El envío usa `fetch` (global en Node 22).
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectQueue(WHATSAPP_INCOMING_QUEUE)
    private readonly queue: Queue<WhatsappIncomingJob>,
  ) {}

  /** Envía un mensaje de texto simple a un número (E.164, sin '+'). */
  async sendTextMessage(
    to: string,
    body: string,
  ): Promise<WhatsappSendResult> {
    return this.sendMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body },
    });
  }

  /** Envía un payload arbitrario al endpoint /messages de la Cloud API. */
  async sendMessage(
    payload: Record<string, unknown>,
  ): Promise<WhatsappSendResult> {
    const phoneNumberId = this.config.getOrThrow<string>(
      'WHATSAPP_PHONE_NUMBER_ID',
    );
    const token = this.config.getOrThrow<string>('WHATSAPP_ACCESS_TOKEN');
    const url = `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response
      .json()
      .catch(() => ({}))) as WhatsappSendResult;

    if (!response.ok) {
      this.logger.error(
        `Meta Cloud API respondió ${response.status}: ${JSON.stringify(data)}`,
      );
      throw new Error(
        `Error enviando mensaje a WhatsApp (HTTP ${response.status}).`,
      );
    }

    return data;
  }

  /**
   * Productor (blueprint Paso 6 §4): parsea el evento de Meta, filtra a solo
   * mensajes de texto (ignora `statuses`/delivery receipts y no-texto) y encola
   * un job por mensaje. Debe ser liviano: el controller ya respondió 200 a Meta.
   *
   * Idempotencia (B1): `jobId = wa_message_id` descarta reenvíos de Meta a nivel
   * de cola; la segunda capa (índice `uq_wa_message`) la aplica el worker al
   * insertar el mensaje del usuario.
   */
  async handleIncomingEvent(payload: unknown): Promise<void> {
    const entries = (payload as { entry?: unknown[] })?.entry ?? [];
    for (const entry of entries) {
      const changes = (entry as { changes?: unknown[] })?.changes ?? [];
      for (const change of changes) {
        const value = (change as { value?: WhatsappWebhookValue })?.value;
        // Sin `messages` => es un evento de estado (delivery receipt) u otro: ignorar.
        if (!value?.messages || value.messages.length === 0) continue;

        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId) {
          this.logger.warn('Evento sin phone_number_id; se descarta.');
          continue;
        }

        for (const msg of value.messages) {
          if (msg.type !== 'text' || !msg.text?.body) {
            // MVP text-only: los no-texto se descartan con log (Paso 6 §4 / C2).
            this.logger.debug(`Mensaje no-texto (${msg.type}) descartado.`);
            continue;
          }
          const job: WhatsappIncomingJob = {
            phoneNumberId,
            contactPhone: msg.from,
            waMessageId: msg.id,
            text: msg.text.body,
          };
          await this.queue.add('incoming', job, {
            jobId: msg.id, // dedup de reenvíos de Meta (B1)
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: true,
            removeOnFail: 100,
          });
        }
      }
    }
  }
}

/** Subconjunto del payload de Meta que consumimos (Paso 6 §4 / C1). */
interface WhatsappWebhookValue {
  metadata?: { phone_number_id?: string };
  messages?: {
    from: string;
    id: string;
    type: string;
    text?: { body?: string };
  }[];
}
