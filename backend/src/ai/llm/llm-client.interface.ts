/**
 * Contrato `LlmClient` abstracto y neutro (blueprint Fase 8 · Paso 4 · §2).
 *
 * Esta es la pieza durable: ningún detalle de Gemini (ni de ningún proveedor)
 * cruza esta frontera. Cada adapter (`GeminiLlmClient`, futuros
 * `AnthropicLlmClient` / `OpenaiLlmClient`) traduce hacia/desde estos tipos.
 * El loop de function calling habla SOLO con `LlmClient`; cambiar de proveedor =
 * nueva clase `implements LlmClient`, cero cambios en el loop ni en las tools.
 */

/**
 * Subset de JSON Schema compatible con todos los proveedores (type, properties,
 * required, enum, description). Sin features exóticas, para que el mapeo a cada
 * SDK sea trivial.
 */
export type JsonSchemaObject = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
};

/** Declaración de una herramienta tal como la ve el modelo. */
export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: JsonSchemaObject;
}

export type LlmRole = 'user' | 'assistant' | 'tool';

/** Una llamada a herramienta pedida por el modelo. */
export interface LlmToolCall {
  /** Id; lo generamos nosotros si el proveedor no lo entrega (caso Gemini). */
  id: string;
  name: string;
  /** Entrada NO confiable: viene del modelo, hay que validarla en el executor. */
  args: Record<string, unknown>;
}

export interface LlmMessage {
  role: LlmRole;
  content?: string;
  /** Presente cuando `role = 'assistant'` y el modelo pide ejecutar tools. */
  toolCalls?: LlmToolCall[];
  /** Presente cuando `role = 'tool'`: a qué call responde. */
  toolCallId?: string;
  /** Presente cuando `role = 'tool'`: nombre de la tool que respondió. */
  name?: string;
}

export type LlmFinishReason = 'stop' | 'tool_calls' | 'length' | 'safety';

export interface LlmResponse {
  text?: string;
  /** Vacío => respuesta final de texto (no hay tools por ejecutar). */
  toolCalls: LlmToolCall[];
  finishReason: LlmFinishReason;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface LlmGenerateParams {
  system: string;
  messages: LlmMessage[];
  tools: ToolDeclaration[];
  /** Por defecto `auto`: el modelo decide. Forzable por turno si hace falta. */
  toolChoice?: 'auto' | 'none' | 'required';
  temperature?: number;
}

export interface LlmClient {
  generate(params: LlmGenerateParams): Promise<LlmResponse>;
}

/**
 * Token de inyección de Nest para el `LlmClient` activo. El provider concreto se
 * elige en runtime según `LLM_PROVIDER` (ver `ai.module.ts`).
 */
export const LLM_CLIENT = Symbol('LLM_CLIENT');
