import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Content,
  FinishReason,
  FunctionCallingConfigMode,
  GenerateContentResponse,
  GoogleGenAI,
  Part,
} from '@google/genai';
import {
  LlmClient,
  LlmFinishReason,
  LlmGenerateParams,
  LlmMessage,
  LlmResponse,
  LlmToolCall,
  ToolDeclaration,
} from './llm-client.interface';

/**
 * Adapter `GeminiLlmClient` (blueprint §3): traduce los tipos neutros de
 * `LlmClient` hacia/desde el SDK unificado `@google/genai`. Ningún tipo de
 * Gemini se filtra fuera de esta clase.
 *
 * Mapeo (§3):
 *   system                 → config.systemInstruction
 *   role 'assistant'       → role 'model'
 *   role 'tool' (resultado)→ part con functionResponse { name, response }
 *   ToolDeclaration[]      → config.tools = [{ functionDeclarations: [...] }]
 *   toolChoice auto/none/required → toolConfig.functionCallingConfig.mode
 *                                   = AUTO / NONE / ANY
 *   functionCall del modelo→ candidates[0].content.parts[].functionCall
 *
 * NOTA AUTENTICACIÓN (§0 / §3): Gemini NO entrega un id por function call, así
 * que el adapter asigna uno (uuid) y preserva el ORDEN para casar los
 * functionResponse en batches. Además, el SDK v2.x envía `apiKey` como header
 * `x-goog-api-key`: las keys con prefijo `AQ.`/`IQ.` (tokens estilo OAuth2) NO
 * autentican por esa vía y devuelven 401 contra el endpoint público de Gemini.
 * Hasta que el SDK/endpoint estabilice ese formato (o se obtenga una key `AIza`),
 * el cliente compila y opera, pero la llamada real fallará en auth. Ver §0.
 */
@Injectable()
export class GeminiLlmClient implements LlmClient {
  private readonly logger = new Logger(GeminiLlmClient.name);
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(config: ConfigService) {
    const apiKey = config.getOrThrow<string>('GEMINI_API_KEY');
    if (apiKey.startsWith('AQ.') || apiKey.startsWith('IQ.')) {
      this.logger.warn(
        'GEMINI_API_KEY tiene prefijo OAuth2 (AQ./IQ.). El SDK la envía como ' +
          'x-goog-api-key y el endpoint público de Gemini la rechazará (401). ' +
          'Se necesita una key AIza para autenticar end-to-end (ver blueprint §0).',
      );
    }
    this.client = new GoogleGenAI({ apiKey });
    // Configurable sin tocar la validación de entorno; default estable.
    this.model = config.get<string>('GEMINI_MODEL') ?? 'gemini-2.5-flash';
  }

  async generate(params: LlmGenerateParams): Promise<LlmResponse> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: this.toContents(params.messages),
      config: {
        systemInstruction: params.system,
        temperature: params.temperature,
        tools: [
          {
            functionDeclarations: params.tools.map((t) =>
              this.toFunctionDeclaration(t),
            ),
          },
        ],
        toolConfig: {
          functionCallingConfig: {
            mode: this.toMode(params.toolChoice ?? 'auto'),
          },
        },
      },
    });

    return this.fromResponse(response);
  }

  // --- Neutro → Gemini -----------------------------------------------------

  private toFunctionDeclaration(tool: ToolDeclaration) {
    return {
      name: tool.name,
      description: tool.description,
      // `parametersJsonSchema` acepta JSON Schema plano (Open API 3.03), así no
      // dependemos del enum `Type` de Gemini para nuestro subset neutro.
      parametersJsonSchema: tool.parameters,
    };
  }

  private toMode(
    toolChoice: 'auto' | 'none' | 'required',
  ): FunctionCallingConfigMode {
    switch (toolChoice) {
      case 'none':
        return FunctionCallingConfigMode.NONE;
      case 'required':
        return FunctionCallingConfigMode.ANY;
      case 'auto':
      default:
        return FunctionCallingConfigMode.AUTO;
    }
  }

  /**
   * Convierte el historial neutro a `Content[]`. Los mensajes `role: 'tool'`
   * adyacentes se fusionan en un único `Content` (role 'user') con varios
   * `functionResponse`, que es como Gemini espera los resultados de un batch.
   */
  private toContents(messages: LlmMessage[]): Content[] {
    const contents: Content[] = [];
    let pendingToolParts: Part[] = [];

    const flushToolParts = () => {
      if (pendingToolParts.length > 0) {
        contents.push({ role: 'user', parts: pendingToolParts });
        pendingToolParts = [];
      }
    };

    for (const message of messages) {
      if (message.role === 'tool') {
        pendingToolParts.push({
          functionResponse: {
            name: message.name,
            response: this.parseToolResponse(message.content),
          },
        });
        continue;
      }

      flushToolParts();

      if (message.role === 'assistant') {
        const parts: Part[] = [];
        if (message.content) parts.push({ text: message.content });
        for (const call of message.toolCalls ?? []) {
          parts.push({
            functionCall: { id: call.id, name: call.name, args: call.args },
          });
        }
        contents.push({ role: 'model', parts });
        continue;
      }

      // role === 'user'
      contents.push({ role: 'user', parts: [{ text: message.content ?? '' }] });
    }

    flushToolParts();
    return contents;
  }

  /**
   * El contenido de un mensaje `tool` viaja como JSON serializado. Gemini quiere
   * un objeto en `functionResponse.response`; si no parsea, lo envolvemos.
   */
  private parseToolResponse(content?: string): Record<string, unknown> {
    if (!content) return {};
    try {
      const parsed = JSON.parse(content);
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : { output: parsed };
    } catch {
      return { output: content };
    }
  }

  // --- Gemini → Neutro -----------------------------------------------------

  private fromResponse(response: GenerateContentResponse): LlmResponse {
    const parts = response.candidates?.[0]?.content?.parts ?? [];

    const toolCalls: LlmToolCall[] = [];
    for (const part of parts) {
      if (part.functionCall?.name) {
        toolCalls.push({
          // Gemini no garantiza id nativo → generamos uno y mantenemos orden.
          id: part.functionCall.id ?? randomUUID(),
          name: part.functionCall.name,
          args: part.functionCall.args ?? {},
        });
      }
    }

    const usage = response.usageMetadata;

    return {
      text: response.text,
      toolCalls,
      finishReason: this.toFinishReason(
        response.candidates?.[0]?.finishReason,
        toolCalls.length > 0,
      ),
      usage: usage
        ? {
            inputTokens: usage.promptTokenCount ?? 0,
            outputTokens: usage.candidatesTokenCount ?? 0,
          }
        : undefined,
    };
  }

  private toFinishReason(
    reason: FinishReason | undefined,
    hasToolCalls: boolean,
  ): LlmFinishReason {
    // Si el modelo pidió tools, ese es el motivo efectivo para el loop, sin
    // importar el código de Gemini (que suele ser STOP en estos casos).
    if (hasToolCalls) return 'tool_calls';
    switch (reason) {
      case FinishReason.MAX_TOKENS:
        return 'length';
      case FinishReason.SAFETY:
      case FinishReason.RECITATION:
        return 'safety';
      default:
        return 'stop';
    }
  }
}
