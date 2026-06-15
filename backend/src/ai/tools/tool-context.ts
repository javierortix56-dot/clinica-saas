import { ActorContext } from '../../database/prisma.service';

/**
 * Contexto server-side que el executor inyecta en CADA tool (blueprint §1, §4).
 *
 * `clinicId` y `actor` NUNCA son parámetros que provee el modelo: el LLM no es
 * la frontera de seguridad. Se derivan de la conversación y se inyectan acá;
 * la aislación tenant la impone RLS, no el prompt.
 */
export interface ToolContext {
  /** Conversación en curso; clave de idempotencia intra-turno y de auditoría. */
  conversationId: string;
  /** Tenant. Inyectado server-side, jamás pedido al modelo. */
  clinicId: string;
  /** Actor de la escritura (el bot de WhatsApp). Inyectado server-side. */
  actor: ActorContext;
  /** Paciente ya identificado en la conversación, si lo hay. */
  patientId?: string;
}
