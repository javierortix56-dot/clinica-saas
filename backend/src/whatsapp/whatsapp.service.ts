import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

  constructor(private readonly config: ConfigService) {}

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
   * Punto de entrada de un evento entrante del webhook. Debe ser liviano: el
   * controller ya respondió 200 a Meta.
   *
   * TODO (paso 6): encolar en BullMQ con dedup por `wa_message_id` en lugar de
   * procesar en línea. Por ahora sólo se registra el evento.
   */
  async handleIncomingEvent(payload: unknown): Promise<void> {
    this.logger.debug(
      `Evento entrante de WhatsApp recibido: ${JSON.stringify(payload)}`,
    );
  }
}
