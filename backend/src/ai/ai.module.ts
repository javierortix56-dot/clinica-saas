import { Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider } from '../config/env.validation';
import { LLM_CLIENT, LlmClient } from './llm/llm-client.interface';
import { GeminiLlmClient } from './llm/gemini-llm.client';
import { ToolExecutorService } from './tools/tool-executor.service';
import { ConversationLoopService } from './conversation-loop.service';

/**
 * Selector del `LlmClient` activo según `LLM_PROVIDER` (blueprint §2): cambiar de
 * proveedor = nueva clase `implements LlmClient`, sin tocar el loop ni las tools.
 * En el Paso 4 solo Gemini está implementado; los demás fallan explícito al
 * arrancar si se los selecciona.
 */
const llmClientProvider: Provider = {
  provide: LLM_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): LlmClient => {
    const provider =
      config.get<LlmProvider>('LLM_PROVIDER') ?? LlmProvider.Gemini;
    switch (provider) {
      case LlmProvider.Gemini:
        return new GeminiLlmClient(config);
      default:
        throw new Error(
          `LLM_PROVIDER="${provider}" aún no tiene adapter (solo "gemini" en Paso 4).`,
        );
    }
  },
};

/**
 * AiModule — cliente LLM abstracto (intercambiable), loop de function calling con
 * sus 4 guards, y las 8 herramientas (declaraciones definitivas + stubs).
 * Lógica real de las tools y persistencia: Paso 5+.
 */
@Module({
  providers: [llmClientProvider, ToolExecutorService, ConversationLoopService],
  exports: [ConversationLoopService, ToolExecutorService, LLM_CLIENT],
})
export class AiModule {}
