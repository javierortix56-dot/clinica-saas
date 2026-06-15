import { Injectable, Logger } from '@nestjs/common';
import { LlmToolCall } from '../llm/llm-client.interface';
import { ToolContext } from './tool-context';
import { fail, ToolResult } from './tool-result';
import { ToolName } from './tool-declarations';
import { TOOL_STUBS, ToolStub } from './tool-stubs';

/**
 * Enruta una `LlmToolCall` a su stub, inyecta el contexto server-side y envuelve
 * cualquier fallo como `ToolResult` (blueprint §5 · `executeTool`).
 *
 * Garantía clave: este método NUNCA propaga una excepción al loop. Una tool
 * inexistente, un stub que lanza, o una regla de negocio violada se devuelven
 * todas como `{ ok:false, error_code, message }`, para que el modelo decida si
 * se recupera o escala.
 */
@Injectable()
export class ToolExecutorService {
  private readonly logger = new Logger(ToolExecutorService.name);

  async execute(call: LlmToolCall, ctx: ToolContext): Promise<ToolResult> {
    const stub: ToolStub | undefined = TOOL_STUBS[call.name as ToolName];
    if (!stub) {
      this.logger.warn(`Tool desconocida solicitada por el modelo: ${call.name}`);
      return fail('UNKNOWN_TOOL', `La herramienta "${call.name}" no existe.`);
    }

    try {
      // Los `args` vienen del modelo (NO confiables); `ctx` lo inyectamos acá:
      // clinic_id y actor jamás los provee el LLM (blueprint §1, §4).
      return await stub(call.args, ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Fallo ejecutando "${call.name}" (conv=${ctx.conversationId}): ${message}`,
      );
      return fail('TOOL_EXECUTION_ERROR', message);
    }
  }
}
