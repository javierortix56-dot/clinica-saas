import { Inject, Injectable, Logger } from '@nestjs/common';
import { LlmToolCall } from '../llm/llm-client.interface';
import { ToolContext } from './tool-context';
import { fail, ToolResult } from './tool-result';
import { ToolHandler, TOOL_HANDLERS } from './tool-handler.interface';

/**
 * Enruta una `LlmToolCall` a su `ToolHandler`, inyecta el contexto server-side y
 * blinda el loop ante excepciones (blueprint Paso 5 §3 · §4).
 *
 * Garantías:
 *  - NUNCA propaga una excepción al loop: una tool inexistente o un handler que
 *    lanza se devuelven como `{ ok:false, ... }`.
 *  - REGLA DE NO-FILTRACIÓN (§A1): si un handler lanza, el mensaje crudo va SOLO
 *    al log; al modelo se le devuelve un INTERNAL_ERROR genérico. Así un eventual
 *    `permission denied for table clinical_notes` nunca llega al modelo.
 */
@Injectable()
export class ToolExecutorService {
  private readonly logger = new Logger(ToolExecutorService.name);
  private readonly handlers: Map<string, ToolHandler>;

  constructor(@Inject(TOOL_HANDLERS) handlers: ToolHandler[]) {
    this.handlers = new Map(handlers.map((h) => [h.name, h]));
  }

  async execute(call: LlmToolCall, ctx: ToolContext): Promise<ToolResult> {
    const handler = this.handlers.get(call.name);
    if (!handler) {
      this.logger.warn(`Tool desconocida solicitada por el modelo: ${call.name}`);
      return fail('UNKNOWN_TOOL', `La herramienta "${call.name}" no existe.`);
    }

    try {
      // `args` viene del modelo (NO confiable); `ctx` lo inyectamos acá:
      // clinic_id y actor jamás los provee el LLM (blueprint §1, §4).
      return await handler.execute(call.args, ctx);
    } catch (err) {
      // Mensaje crudo SOLO al log; al modelo, genérico (no filtra internals).
      this.logger.error(
        `Fallo no controlado en "${call.name}" (conv=${ctx.conversationId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return fail(
        'INTERNAL_ERROR',
        'Ocurrió un problema procesando la solicitud. Intentá nuevamente en un momento.',
      );
    }
  }
}
