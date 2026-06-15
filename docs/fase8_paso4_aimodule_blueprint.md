# FASE 8 — PASO 4: AiModule (Blueprint)

Plano para Claude Code. Objetivo del paso: dejar el **loop de function calling**
funcionando contra un **cliente LLM abstracto** (proveedor Gemini, intercambiable),
declarando las 8 tools como **stubs**. Sin lógica de negocio real todavía (eso es
Paso 5). El criterio de "hecho" es: compila, el loop ejecuta una ronda con tools
stub, y el modelo recibe los resultados y produce una respuesta final.

---

## 0. Pre-requisito bloqueante (fuera de este paso, pero antes de poder probarlo)

La `GEMINI_API_KEY` con prefijo `AQ.` **no autentica** contra el endpoint de
Gemini (devuelve 401, espera un OAuth2 token). Se necesita una key `AIza`.

**Actualización:** se regeneró la key en AI Studio y sigue dando prefijo `AQ.`
(no `AIza`). Reportes públicos recientes (foro de Google AI Developers, últimos
días) muestran el mismo problema en múltiples cuentas — keys nuevas con `AQ.` o
incluso `IQ.` que fallan 401 contra `google-genai`. Parece un cambio de formato
de Google (hacia tokens tipo OAuth2) que el SDK/endpoint aún no soporta de forma
estable, **no un problema de la cuenta de Javier**.

Acción cuando se implemente §3: usar la versión más reciente de `@google/genai`
y validar si soporta el formato `AQ.`. Si no, monitorear el foro de Google para
fix/anuncio. Hasta entonces, el loop compila pero no se puede probar end-to-end.
El resto del blueprint no depende de esto.

**Estado al implementar el Paso 4:** se instaló `@google/genai` v2.8.0. El SDK
envía `apiKey` como header `x-goog-api-key`; las keys `AQ.`/`IQ.` (tokens estilo
OAuth2) no autentican por esa vía. El `GeminiLlmClient` detecta el prefijo y
emite un `warn` al construirse, pero queda funcional: cuando se obtenga una key
`AIza` (o el SDK/endpoint estabilice el formato OAuth2) la llamada real
funcionará sin cambios de código.

---

## 1. Decisiones cerradas

| Decisión | Resolución | Motivo |
|---|---|---|
| Paralelismo de tool calls | Lectura: paralelo permitido. Escritura: estrictamente secuencial, **máx. 1 escritura efectiva por ronda** | El modelo puede emitir batches; las lecturas son idempotentes, las escrituras no |
| Tope de iteraciones | `MAX_TOOL_ROUNDS = 8` | Corta runaway y costo; si se excede → handoff a humano |
| Idempotencia intra-turno | Guard por `key = (conversation_id, tool_name, hash(args))` para escrituras | Evita doble `agendar_turno` dentro del mismo turno |
| Errores de tool | Se devuelven como **tool result estructurado** `{ ok:false, error_code, message }`, no como excepción que tira el loop | El modelo se recupera o escala; las reglas de negocio (cool-down, prime time) son resultados, no crashes |
| `clinic_id` y actor | **Nunca** son parámetros que provee el modelo. Se inyectan server-side desde el contexto de la conversación | El LLM no es la frontera de seguridad; RLS impone la aislación tenant |
| `toolChoice` por defecto | `auto` | Dejamos que el modelo decida; se puede forzar `required`/`none` por turno si hace falta |

---

## 2. Contrato `LlmClient` abstracto (neutro, proveedor-agnóstico)

Esta es la pieza durable. Ningún detalle de Gemini cruza esta frontera; el
`GeminiLlmClient` traduce hacia/desde estos tipos.

```typescript
type JsonSchemaObject = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
};
interface ToolDeclaration {
  name: string;
  description: string;
  parameters: JsonSchemaObject;
}
type LlmRole = 'user' | 'assistant' | 'tool';
interface LlmToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}
interface LlmMessage {
  role: LlmRole;
  content?: string;
  toolCalls?: LlmToolCall[];
  toolCallId?: string;
  name?: string;
}
interface LlmResponse {
  text?: string;
  toolCalls: LlmToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'safety';
  usage?: { inputTokens: number; outputTokens: number };
}
interface LlmClient {
  generate(params: {
    system: string;
    messages: LlmMessage[];
    tools: ToolDeclaration[];
    toolChoice?: 'auto' | 'none' | 'required';
    temperature?: number;
  }): Promise<LlmResponse>;
}
```

El loop habla **solo** con `LlmClient`. Cambiar de proveedor = nueva clase
`implements LlmClient`, cero cambios en el loop ni en las tools.

**Implementación:** `src/ai/llm/llm-client.interface.ts` (tipos + token de
inyección `LLM_CLIENT`).

---

## 3. Adapter `GeminiLlmClient`: qué traduce

SDK: **`@google/genai`** v2.8.0 (el unificado actual). Mapeo:

| Concepto neutro | Equivalente en Gemini |
|---|---|
| `system` | `config.systemInstruction` |
| `role: 'assistant'` | `role: 'model'` |
| `role: 'tool'` (resultado) | part con `functionResponse` (`{ name, response }`), role `user` |
| `ToolDeclaration[]` | `config.tools: [{ functionDeclarations: [...] }]` |
| `parameters` (JSON Schema) | `functionDeclarations[].parametersJsonSchema` |
| `toolChoice: auto/none/required` | `toolConfig.functionCallingConfig.mode = AUTO/NONE/ANY` |
| Tool call del modelo | `candidates[0].content.parts[].functionCall` `{ name, args }` |
| `LlmToolCall.id` | **Gemini no da id nativo** → generar uno (`randomUUID`) y mapear por orden |

Detalle: como Gemini no entrega un `id` por function call, el adapter lo asigna
y mantiene el orden al construir los `functionResponse`. Los mensajes `tool`
adyacentes se fusionan en un único `Content` (role `user`) con varios
`functionResponse`, que es como Gemini espera los resultados de un batch.

**Implementación:** `src/ai/llm/gemini-llm.client.ts`.

---

## 4. Las 8 tools — declaraciones que ve el modelo

Regla transversal: **`clinic_id` y el actor NO aparecen** en estas firmas. El
executor los inyecta del contexto.

| Tool | Tipo | Parámetros visibles al modelo | Notas |
|---|---|---|---|
| `buscar_paciente_por_dni` | R | `dni: string` | Devuelve match o "no existe" |
| `consultar_catalogo` | R | `treatment_type?: string` | Rango de precios + tarifa de valoración |
| `consultar_politicas_clinica` | R | `tema?: enum(puntualidad, no_show, precios, valoracion)` | Configurable por clínica |
| `consultar_historial_paciente` | R | `patient_id: string` | **Resumen seguro** (ver §6), NO notas clínicas |
| `proponer_turnos` | R | `treatment_type: string`, `fase?: string`, `professional_id?: string`, `desde?: string`, `hasta?: string` | Cool-down, prime time, disponibilidad |
| `registrar_paciente` | W | `dni: string`, `nombre: string`, `apellido: string`, `telefono?: string` | |
| `iniciar_tratamiento` | W | `patient_id: string`, `treatment_type: string` | Crea `treatment_id` + fases |
| `agendar_turno` | W | `patient_id: string`, `professional_id: string`, `treatment_phase: string`, `start_at: string` | Siempre estado `proposed` |

En Paso 4 cada una es un **stub** que devuelve `{ ok:true, data:{...} }`. La firma
(nombre, descripción, params) es la definitiva.

**Implementación:** `src/ai/tools/tool-declarations.ts` (firmas +
clasificación read/write), `src/ai/tools/tool-stubs.ts` (payloads de ejemplo).

---

## 5. El loop con guards

`src/ai/conversation-loop.service.ts` (`ConversationLoopService.runTurn`) +
`src/ai/tools/tool-executor.service.ts` (`ToolExecutorService.execute`).

Los 4 guards:

1. **Paralelo/secuencial:** lecturas con `Promise.all`; escrituras en un `for`
   con `break` tras la primera efectiva (máx. 1 escritura por ronda).
2. **Tope:** `MAX_TOOL_ROUNDS = 8` → `outcome: 'handoff'`.
3. **Idempotencia:** `key = (conversationId, tool, sha256(stableStringify(args)))`
   cacheada en `writesThisTurn`.
4. **Errores como resultado:** `executeTool` envuelve cualquier fallo en
   `{ ok:false, error_code, message }`; nunca propaga excepción al loop.

El loop es **puro**: recibe `ctx`, `history`, `system` e `incomingMessage` por
parámetro y devuelve los `newMessages` a persistir. La carga/persistencia es del
ConversationModule (Paso 5+).

---

## 6. RBAC del bot vs. historial clínico

`consultar_historial_paciente` devuelve un **resumen seguro** — lista de
tratamientos, fechas, profesional asignado y estado de fase — y **nunca** el
contenido de `clinical_notes`. La tabla `clinical_notes` queda fuera del alcance
del actor bot a nivel RLS, igual que para recepción. El stub ya refleja este
contrato (`clinical_notes_excluidas: true`). La política RLS correspondiente se
implementa con la lógica real (Paso 5+).

---

## 7. Qué deja listo este paso y qué no

Listo:
- `LlmClient` + `GeminiLlmClient`.
- Las 8 `ToolDeclaration` definitivas.
- El loop con los 4 guards.
- Stubs de las 8 tools devolviendo payloads de ejemplo.

No (es Paso 5+):
- Lógica real de las tools (queries Prisma, cool-down/prime time).
- Cola BullMQ + worker (Paso 6).
- Persistencia/carga de historial en ConversationModule.
- Prueba end-to-end del Escenario 2 (Paso 7).

---

## 8. Archivos del paso

```
src/ai/
  ai.module.ts                       Selector de proveedor + wiring
  conversation-loop.service.ts       Loop con los 4 guards (§5)
  llm/
    llm-client.interface.ts          Tipos neutros + LlmClient + LLM_CLIENT (§2)
    gemini-llm.client.ts             Adapter Gemini (§3)
  tools/
    tool-context.ts                  ToolContext (clinic_id/actor inyectados)
    tool-result.ts                   ToolResult { ok } | { ok:false, ... }
    tool-declarations.ts             Las 8 firmas + read/write (§4)
    tool-stubs.ts                    Stubs de las 8 tools (§4, §6)
    tool-executor.service.ts         executeTool con wrapping de errores (§5)
```
