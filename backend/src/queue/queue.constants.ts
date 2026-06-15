/** Nombre de la cola de mensajes entrantes de WhatsApp (Paso 6 §2). */
export const WHATSAPP_INCOMING_QUEUE = 'whatsapp-incoming';

/**
 * Payload de un job: ya parseado y filtrado por el productor (solo `text`),
 * para que el worker no toque la estructura cruda de Meta (Paso 6 §4).
 * `deferrals` cuenta los reencolados por contención del lock (Paso 6 §3).
 */
export interface WhatsappIncomingJob {
  phoneNumberId: string;
  contactPhone: string;
  waMessageId: string;
  text: string;
  deferrals?: number;
}
