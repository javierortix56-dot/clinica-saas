import { Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider } from '../config/env.validation';
import { PatientsModule } from '../patients/patients.module';
import { CatalogModule } from '../catalog/catalog.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { BuscarPacienteHandler } from '../patients/handlers/buscar-paciente.handler';
import { RegistrarPacienteHandler } from '../patients/handlers/registrar-paciente.handler';
import { ConsultarHistorialHandler } from '../patients/handlers/consultar-historial.handler';
import { ConsultarCatalogoHandler } from '../catalog/handlers/consultar-catalogo.handler';
import { ConsultarPoliticasHandler } from '../catalog/handlers/consultar-politicas.handler';
import { ProponerTurnosHandler } from '../scheduling/handlers/proponer-turnos.handler';
import { AgendarTurnoHandler } from '../scheduling/handlers/agendar-turno.handler';
import { IniciarTratamientoHandler } from '../scheduling/handlers/iniciar-tratamiento.handler';
import { LLM_CLIENT, LlmClient } from './llm/llm-client.interface';
import { GeminiLlmClient } from './llm/gemini-llm.client';
import { ToolHandler, TOOL_HANDLERS } from './tools/tool-handler.interface';
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
 * Registro `TOOL_HANDLERS` (blueprint Paso 5 §3): reúne los 8 handlers reales
 * exportados por los módulos de dominio para que el `ToolExecutorService` enrute
 * por nombre.
 */
const toolHandlersProvider: Provider = {
  provide: TOOL_HANDLERS,
  inject: [
    BuscarPacienteHandler,
    RegistrarPacienteHandler,
    ConsultarHistorialHandler,
    ConsultarCatalogoHandler,
    ConsultarPoliticasHandler,
    ProponerTurnosHandler,
    AgendarTurnoHandler,
    IniciarTratamientoHandler,
  ],
  useFactory: (...handlers: ToolHandler[]): ToolHandler[] => handlers,
};

/**
 * AiModule — cliente LLM abstracto (intercambiable), loop de function calling con
 * sus 4 guards, y las 8 herramientas (declaraciones + handlers reales del Paso 5).
 */
@Module({
  imports: [PatientsModule, CatalogModule, SchedulingModule],
  providers: [
    llmClientProvider,
    toolHandlersProvider,
    ToolExecutorService,
    ConversationLoopService,
  ],
  exports: [ConversationLoopService, ToolExecutorService, LLM_CLIENT],
})
export class AiModule {}
