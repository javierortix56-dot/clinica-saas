import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  LLM_CLIENT,
  LlmClient,
  LlmMessage,
  LlmToolCall,
} from './llm/llm-client.interface';
import { isWriteTool, TOOL_DECLARATIONS } from './tools/tool-declarations';
import { ToolContext } from './tools/tool-context';
import { ToolResult } from './tools/tool-result';
import { ToolExecutorService } from './tools/tool-executor.service';

/** Corta runaway y costo; si se excede → handoff a humano (blueprint §1). */
export const MAX_TOOL_ROUNDS = 8;

export interface RunTurnInput {
  ctx: ToolContext;
  /** Historial previo de la conversación (sin el mensaje entrante). */
  history: LlmMessage[];
  /** Mensaje entrante del paciente para este turno. */
  incomingMessage: string;
  /** Prompt de sistema ya construido para esta clínica/conversación. */
  system: string;
  temperature?: number;
}

export type RunTurnResult =
  | {
      outcome: 'final';
      /** Texto final para enviar al paciente. */
      text: string;
      /** Mensajes a persistir (assistant + tool turns + respuesta final). */
      newMessages: LlmMessage[];
      rounds: number;
    }
  | {
      outcome: 'handoff';
      reason: 'max_tool_rounds';
      newMessages: LlmMessage[];
      rounds: number;
    };

/**
 * Loop de function calling con los 4 guards del blueprint §5:
 *   1. Lecturas en paralelo / escrituras secuenciales.
 *   2. Tope de iteraciones (MAX_TOOL_ROUNDS) → handoff.
 *   3. Idempotencia intra-turno de escrituras (máx. 1 efectiva por ronda).
 *   4. Errores de tool como resultado estructurado, nunca excepción.
 *
 * El loop habla SOLO con `LlmClient` (proveedor-agnóstico) y `ToolExecutorService`.
 * La carga/persistencia del contexto y el historial son responsabilidad del
 * ConversationModule (Paso 5+); acá recibimos todo por parámetro y devolvemos los
 * mensajes nuevos a persistir, para mantener el loop puro y testeable.
 */
@Injectable()
export class ConversationLoopService {
  private readonly logger = new Logger(ConversationLoopService.name);

  constructor(
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
    private readonly executor: ToolExecutorService,
  ) {}

  async runTurn(input: RunTurnInput): Promise<RunTurnResult> {
    const { ctx, system, temperature } = input;

    const userMsg: LlmMessage = {
      role: 'user',
      content: input.incomingMessage,
    };
    // Trabajamos sobre una copia; `newMessages` acumula lo que hay que persistir.
    const messages: LlmMessage[] = [...input.history, userMsg];
    const newMessages: LlmMessage[] = [userMsg];

    // Guard de idempotencia intra-turno: key = (conv, tool, hash(args)).
    const writesThisTurn = new Map<string, ToolResult>();

    for (let round = 1; round <= MAX_TOOL_ROUNDS; round++) {
      const resp = await this.llm.generate({
        system,
        messages,
        tools: TOOL_DECLARATIONS,
        toolChoice: 'auto',
        temperature,
      });

      if (resp.toolCalls.length === 0) {
        // Respuesta final de texto: no hay más tools que ejecutar.
        const assistantMsg: LlmMessage = {
          role: 'assistant',
          content: resp.text ?? '',
        };
        newMessages.push(assistantMsg);
        return {
          outcome: 'final',
          text: resp.text ?? '',
          newMessages,
          rounds: round,
        };
      }

      const reads = resp.toolCalls.filter((c) => !isWriteTool(c.name));
      const writes = resp.toolCalls.filter((c) => isWriteTool(c.name));

      // (1) Lecturas en paralelo: idempotentes, sin efectos secundarios.
      const readResults = await Promise.all(
        reads.map(async (call) => ({
          call,
          result: await this.executor.execute(call, ctx),
        })),
      );

      // (1)+(3) Escrituras secuenciales, máx. 1 EFECTIVA por ronda, con guard de
      // idempotencia. Un batch de escrituras se corta tras la primera efectiva.
      const writeResults: { call: LlmToolCall; result: ToolResult }[] = [];
      for (const call of writes) {
        const key = this.idempotencyKey(ctx.conversationId, call);
        const cached = writesThisTurn.get(key);
        if (cached) {
          // Reusamos el resultado previo: no re-ejecutamos la escritura.
          writeResults.push({ call, result: cached });
          continue;
        }
        const result = await this.executor.execute(call, ctx);
        writesThisTurn.set(key, result);
        writeResults.push({ call, result });
        break; // corta el resto de escrituras del batch en esta ronda
      }

      // Escrituras no efectivas en esta ronda (cortadas por el break): hay que
      // darles SIEMPRE un functionResponse (Gemini exige respuesta por cada
      // functionCall). Si la escritura es un DUPLICADO idéntico de una que ya se
      // ejecutó este turno, devolvemos el resultado cacheado (idempotencia); si
      // es una escritura distinta, la diferimos al próximo turno.
      const executed = new Set([
        ...readResults.map((r) => r.call.id),
        ...writeResults.map((r) => r.call.id),
      ]);
      const deferred = resp.toolCalls
        .filter((c) => !executed.has(c.id))
        .map((call) => {
          const cached = writesThisTurn.get(
            this.idempotencyKey(ctx.conversationId, call),
          );
          if (cached) return { call, result: cached };
          return {
            call,
            result: {
              ok: false as const,
              error_code: 'DEFERRED_WRITE',
              message:
                'Escritura diferida: solo se ejecuta una escritura por ronda. ' +
                'Reintentá en el próximo turno si sigue siendo necesaria.',
            },
          };
        });

      // Construimos los mensajes de la ronda: assistant pidiendo tools + un
      // mensaje tool por cada resultado (en el orden original del batch).
      const assistantToolMsg: LlmMessage = {
        role: 'assistant',
        content: resp.text,
        toolCalls: resp.toolCalls,
      };

      const byId = new Map(
        [...readResults, ...writeResults, ...deferred].map((r) => [
          r.call.id,
          r,
        ]),
      );
      const toolMsgs: LlmMessage[] = resp.toolCalls.map((call) => {
        const entry = byId.get(call.id)!;
        return {
          role: 'tool',
          toolCallId: call.id,
          name: call.name,
          content: JSON.stringify(entry.result),
        };
      });

      messages.push(assistantToolMsg, ...toolMsgs);
      newMessages.push(assistantToolMsg, ...toolMsgs);
    }

    // (2) Excedió el tope de iteraciones → handoff a humano.
    this.logger.warn(
      `Conversación ${ctx.conversationId} excedió MAX_TOOL_ROUNDS=${MAX_TOOL_ROUNDS}; handoff a humano.`,
    );
    return {
      outcome: 'handoff',
      reason: 'max_tool_rounds',
      newMessages,
      rounds: MAX_TOOL_ROUNDS,
    };
  }

  /**
   * Idempotencia intra-turno (blueprint §1): evita un doble `agendar_turno`
   * dentro del mismo turno. Hash estable de los args para no depender del orden
   * de claves del JSON del modelo.
   */
  private idempotencyKey(conversationId: string, call: LlmToolCall): string {
    const argsHash = createHash('sha256')
      .update(this.stableStringify(call.args))
      .digest('hex');
    return `${conversationId}:${call.name}:${argsHash}`;
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map((v) => this.stableStringify(v)).join(',')}]`;
    }
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${this.stableStringify(v)}`);
    return `{${entries.join(',')}}`;
  }
}
