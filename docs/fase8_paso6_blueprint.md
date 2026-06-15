# FASE 8 — PASO 6: Cola BullMQ + Worker (Blueprint)

Plano para Claude Code. Objetivo del paso: **unir todo** de forma asíncrona.
WhatsApp exige responder el webhook en segundos; el procesamiento pesado (LLM +
BD) va a una cola. Este paso conecta: `webhook → encolar → worker → (cargar
contexto + loop del Paso 4 + tools del Paso 5 + responder por WhatsApp) →
persistir`. También implementa el `ConversationModule` (hoy stub), que es quien
carga/guarda la conversación y construye el contexto del loop.

El criterio de "hecho" es: compila; el webhook encola con dedup; el worker
procesa un job (ruteo → lock → contexto → `runTurn` → persistencia → envío);
errores y handoff manejados. Prueba end-to-end real del Escenario 2: Paso 7.

> Continúa los Pasos 4 (loop + `LlmClient` abstracto) y 5 (8 tools reales). El
> loop `ConversationLoopService.runTurn({ ctx, history, incomingMessage, system })`
> ya existe y devuelve `{ outcome, text?, newMessages, rounds }`; este paso le
> provee `ctx`/`history`/`system` y persiste `newMessages`.

---

## 0. Pre-requisitos y límites del paso

- **Redis requerido.** El worker necesita Redis; `REDIS_URL` pasa de opcional a
  **requerido** (validado al arranque). Sin Redis, la cola no levanta.
- **No se prueba end-to-end acá.** Igual que el blocker de la `GEMINI_API_KEY`
  (Paso 4 §0) y el P1000 del pooler, el criterio de "hecho" es compilación +
  orquestación correcta. El Escenario 2 real es Paso 7.
- **Persona/flujos del prompt: mínimos.** El system prompt de este paso es el
  mínimo viable (E1); la persona y los flujos completos (Escenario 1/2) se
  enriquecen en el Paso 7.

---

## 1. Decisiones cerradas

| # | Decisión | Resolución |
|---|---|---|
| A1 | Deps | `bullmq` + `ioredis`; `REDIS_URL` **requerido** cuando el worker está activo |
| A2 | Integración | `@nestjs/bullmq` (oficial) |
| A3 | Proceso | MVP **mismo proceso** (webhook + worker en el `AppModule`), pero el worker **desacoplado del ciclo de vida del webhook**: separarlo a `worker.ts` después debe ser mover un entrypoint, no refactorizar |
| A4 | Orden / concurrencia | **Serializar por conversación, paralelizar entre conversaciones** vía **mutex por clave en Redis** (no concurrencia 1 global). Clave = `phone_number_id:contact_phone`. Contención → **reencolado diferido** (sin consumir `attempts`); lock con **heartbeat** de renovación + TTL como red ante worker muerto |
| A5 | Reintentos | `attempts: 3` + backoff exponencial; al agotar → **fallback genérico al paciente** + log |
| B1 | Idempotencia | Doble capa: `jobId = wa_message_id` (al encolar) + índice `uq_wa_message` (al insertar el mensaje del usuario) |
| C1 | Parsing | Extraer `value.metadata.phone_number_id`, `messages[].from/id/type/text.body` |
| C2 | Alcance MVP | **Solo `type:'text'`**; `statuses`/delivery receipts y no-texto se descartan **antes de encolar** |
| D1 | Routing | `phone_number_id → clinic_id` vía `whatsapp_channels` (is_active); desconocido → descartar + log |
| D2 | Conversación | Activa por `(clinic_id, contact_phone)`; crear si no hay (`status='active'`, `patient_id=null`) — índice `uq_active_conversation` |
| D3 | Encoding de historial | Se persiste el **formato NEUTRO** (`LlmMessage`/`toolCalls` del `LlmClient` abstracto del Paso 4), **nunca** el formato nativo de Gemini |
| D4 | Persistencia | Guardar **todos** los `newMessages` del turno; `wa_message_id` solo en el mensaje del usuario |
| D5 | `patient_id` | El **primer match exitoso** de `buscar_paciente_por_dni`/`registrar_paciente` fija `conversations.patient_id`. Un match posterior con `patient_id` distinto **no sobreescribe**: es **discrepancia → candidato a handoff** |
| E1 | System prompt | Template mínimo: nombre de clínica, timezone, regla de identificación por DNI, recordatorio de que `clinic_id`/actor son server-side |
| F1 | Actor del bot | `BOT_ACTOR_ID` por env (uuid fijo); `runAsBot` con `source='whatsapp_bot'` |
| G1 | Respuesta | `WhatsappService.sendTextMessage(contact_phone, text)`, **un solo mensaje** (sin chunking) |
| G2 | Handoff | `outcome:'handoff'` / `MAX_TOOL_ROUNDS` → `conversations.status='handed_off'` + mensaje al paciente; staff lo ve en el panel (Fase 9) |

---

## 2. Arquitectura y módulos

```
WhatsappController (POST)  --200 inmediato-->
  WhatsappService.handleIncomingEvent(payload)   [PRODUCTOR]
    parse + filtro C2 (solo text, ignora statuses)
    enqueue job en 'whatsapp-incoming' con jobId = wa_message_id   [B1]
                          │
                          ▼  (Redis / BullMQ)
WhatsappIncomingProcessor  [WORKER, @Processor]   ← desacoplado (A3)
  1. lock Redis por `wa:${phone_number_id}:${contact_phone}`  [A4]
  2. ConversationService.route(phone_number_id) → clinic_id    [D1]
  3. ConversationService.resolveConversation(clinic, phone)    [D2]
  4. dedup uq_wa_message (insert msg usuario; si existe → skip) [B1]
  5. ConversationService.loadHistory(conv) → LlmMessage[]       [D3]
  6. SystemPromptService.build(clinic)                          [E1]
  7. ctx = { conversationId, clinicId, actor(BOT_ACTOR_ID), patientId } [F1]
  8. ConversationLoopService.runTurn({ ctx, history, system, incomingMessage })
  9. ConversationService.persistTurn(conv, newMessages, waMessageId) [D4]
 10. resolverPatientId(newMessages) → set/discrepancia → handoff [D5]
 11. outcome 'final'  → WhatsappService.sendTextMessage(phone, text) [G1]
     outcome 'handoff'→ status='handed_off' + mensaje al paciente   [G2]
  (finally) liberar lock Redis
```

Módulos:

| Módulo | Contenido | Notas |
|---|---|---|
| `QueueModule` | `BullModule.forRootAsync` (connection desde `REDIS_URL`) + `registerQueue('whatsapp-incoming')`; `RedisLockService` (mutex A4) | Global; exporta la queue y el lock |
| `WhatsappModule` | (existente) + inyecta la queue para encolar en `handleIncomingEvent` | Importa `QueueModule` |
| `ConversationModule` | `ConversationService` (routing, resolve/create, load/persist, patient_id) + `SystemPromptService` | Implementa el stub; usa `PrismaService` (global) |
| `WorkerModule` | `WhatsappIncomingProcessor` (`@Processor`) | Importa `QueueModule`, `ConversationModule`, `AiModule`, `WhatsappModule`. **Es el entrypoint movible a `worker.ts`** (A3) |

A3 en concreto: la lógica del worker vive **toda** en `WhatsappIncomingProcessor`
(+ los servicios que inyecta), no en el controller. Separar a `worker.ts` =
crear un `NestFactory.createApplicationContext(WorkerModule)` en un main aparte;
no hay que tocar la orquestación.

---

## 3. A4 — Serialización por conversación (la pieza central)

Problema: dos mensajes seguidos del mismo contacto no deben procesarse en
paralelo (pisarían el `context`/historial de la conversación), pero
conversaciones distintas **sí** deben correr en paralelo. BullMQ OSS no tiene
*group concurrency* nativo (es feature de BullMQ Pro), así que se resuelve con un
**mutex por clave en Redis**:

- Worker con concurrencia global `QUEUE_CONCURRENCY` (p.ej. 5, configurable).
- Al tomar un job, el processor intenta `SET lock:wa:<phone_number_id>:<contact_phone> <token> NX PX <ttl>`.
  - **Lock adquirido** → procesa; libera en `finally` (solo si el token coincide,
    vía script Lua, para no liberar el lock de otro).
  - **Lock NO adquirido** (otro mensaje de esa misma conversación en vuelo) →
    **reencolar el MISMO job diferido** (`job.moveToDelayed(now + QUEUE_CONTENTION_DELAY_MS)`
    + lanzar `DelayedError`), NO esperar bloqueando el slot del worker. Diferir
    **no consume `attempts`** (no es un fallo de procesamiento; es contención): el
    job vuelve a `delayed` y se reintenta cuando el lock se libere. Así se
    **serializa por conversación** y se **paraliza entre** conversaciones.
  - **Tope de diferimientos**: se cuenta el nº de diferimientos en `job.data`
    (`deferrals`) con cap `ceil(QUEUE_LOCK_TTL_MS / QUEUE_CONTENTION_DELAY_MS) + N`.
    Si se supera (no debería: ver dead-holder) → tratar como fallo → dispara A5
    (fallback genérico). El segundo mensaje **nunca** queda atascado sin salida.

### TTL del lock + extensión (renovación)

- `QUEUE_LOCK_TTL_MS` **default 120000** (2 min): margen sobre el peor caso de un
  turno = `MAX_TOOL_ROUNDS` (8) × latencia de Gemini por ronda (~10s) + queries de
  tools ≈ 80s. El TTL **no** corre contra el reloj de un turno largo:
- **Lock extension (heartbeat):** mientras el job está vivo, un timer renueva el
  lock cada `QUEUE_LOCK_TTL_MS / 3` (PEXPIRE con check de token vía Lua). Un turno
  legítimamente lento (LLM lento, 8 rondas) **no pierde** el lock a mitad de
  camino. El timer se cancela en el `finally` junto con la liberación.
- El TTL sigue siendo la **red de seguridad ante worker muerto** (A5): si el
  proceso que tiene el lock muere, deja de renovar y el lock **expira solo** a los
  ≤ `QUEUE_LOCK_TTL_MS`. El segundo mensaje (diferido) adquiere el lock dentro de
  ~TTL y **procesa normalmente** — no se queda colgado ni necesita el fallback.
  Solo si incluso tras la expiración el procesamiento real falla 3× aplica A5.

Clave = `phone_number_id:contact_phone` (no `conversation_id`): el
`phone_number_id` mapea 1:1 a la clínica y está en el payload **sin** consultar la
BD, y junto al teléfono es la misma unicidad que `uq_active_conversation`. Así el
lock se toma **antes** de cualquier query.

> Orden estricto FIFO dentro de una conversación es *best-effort*: los mensajes
> del mismo usuario llegan naturalmente espaciados; si dos caen juntos, el segundo
> se difiere y reprocesa. FIFO por grupo garantizado (BullMQ Pro Groups) es
> endurecimiento futuro si se necesita; se anota como deuda técnica.

---

## 4. Productor: parsing y filtro (C1/C2/B1)

`WhatsappService.handleIncomingEvent(payload)`:
1. Recorrer `payload.entry[].changes[].value`.
2. **Ignorar** si no hay `value.messages` (p.ej. `value.statuses` = delivery
   receipts) → return sin encolar (C2).
3. Por cada `messages[]`:
   - Si `type !== 'text'` → (MVP) encolar un marcador de "no-texto" que el worker
     responde pidiendo texto, **o** descartar con log. *Resolución:* descartar con
     log en MVP; el worker no recibe no-textos. (El pedido de "mandá texto" se
     puede sumar luego sin tocar el contrato.)
   - Extraer `{ phoneNumberId: value.metadata.phone_number_id, contactPhone: messages[].from, waMessageId: messages[].id, text: messages[].text.body }`.
   - Encolar en `whatsapp-incoming` con `jobId = waMessageId` (B1: dedup de
     reenvíos de Meta a nivel cola), `attempts: 3`, `backoff: exponential` (A5).
4. El controller ya respondió 200; este método debe ser liviano (parse + enqueue).

---

## 5. Worker: orquestación (D1–D5, E1, F1, G1, G2)

`WhatsappIncomingProcessor.process(job)` con `job.data = { phoneNumberId, contactPhone, waMessageId, text }`:

1. **Lock** (A4): adquirir el mutex; si no se adquiere → `moveToDelayed` + `DelayedError`
   (reencolado sin consumir `attempts`); si se adquiere → arrancar el heartbeat de
   renovación y liberar+cancelar en el `finally`.
2. **Routing** (D1): `clinic_id` desde `whatsapp_channels` por `phone_number_id`
   (is_active, deleted_at null). Desconocido → log + return (no reintentar).
3. **Conversación** (D2): activa por `(clinic_id, contact_phone)`; crear si no hay.
4. **Dedup BD** (B1): insertar el mensaje del usuario en `conversation_messages`
   con `wa_message_id`. Si viola `uq_wa_message` (ya procesado) → return idempotente.
5. **Historial** (D3): `loadHistory(conv)` → `LlmMessage[]` en **formato neutro**:
   - `role='user'|'assistant'` con `content`.
   - `role='assistant'` con `tool_calls` jsonb = `LlmToolCall[]` (`{id,name,args}`).
   - `role='tool'` con `content` = JSON del resultado y `tool_calls` jsonb =
     `{ toolCallId, name }`.
   - **Nunca** formato Gemini; el adapter del Paso 3 traduce neutro↔Gemini dentro
     del `LlmClient`.
6. **System prompt** (E1): `SystemPromptService.build(clinic)` mínimo.
7. **ctx** (F1): `{ conversationId, clinicId, actor: { actorId: BOT_ACTOR_ID, source: 'whatsapp_bot' }, patientId: conv.patient_id ?? undefined }`.
8. **Loop**: `runTurn({ ctx, history, system, incomingMessage: text })`.
9. **Persistencia** (D4): guardar **todos** los `newMessages` (excepto el mensaje
   de usuario ya insertado en el paso 4) en `conversation_messages`, en formato
   neutro. Actualizar `conversations.last_message_at`.
10. **patient_id** (D5): inspeccionar los resultados de tools en `newMessages`:
    - Si `buscar_paciente_por_dni`/`registrar_paciente` devolvió `ok` con un
      `patient_id` y `conv.patient_id` es null → fijarlo (`update conversations`).
    - Si `conv.patient_id` ya estaba seteado y el nuevo difiere → **no
      sobreescribir**: marcar discrepancia (en `context`/log) y tratar como
      candidato a **handoff** (status `handed_off` + mensaje).
11. **Salida**:
    - `outcome:'final'` → `WhatsappService.sendTextMessage(contact_phone, text)` (G1).
    - `outcome:'handoff'` → `conversations.status='handed_off'` + mensaje al
      paciente ("te derivo con una persona del equipo") (G2).
12. **finally**: liberar el lock (Lua check-and-del).

Errores (A5): si el `process` lanza (LLM caído, envío fallido), BullMQ reintenta
(`attempts: 3`, backoff). En el evento `failed` tras el último intento → enviar
un **fallback genérico** al paciente ("estamos con una demora, en un momento te
respondemos") y loguear. La discrepancia de identidad (D5) y el routing
desconocido (D1) **no** se reintentan (no son transitorios).

---

## 6. ConversationModule (implementa el stub)

`ConversationService` (usa `PrismaService` global; escrituras del bot por
`runAsBot` con `BOT_ACTOR_ID`):
- `route(phoneNumberId): clinicId | null`
- `resolveConversation(clinicId, contactPhone): conversation` (find active or create)
- `loadHistory(conversationId): LlmMessage[]` (mapeo neutro D3)
- `persistTurn(conversation, newMessages, waMessageId)` (D4; idempotencia B1 en el
  mensaje de usuario)
- `setPatientIfUnset(conversationId, patientId): { set: boolean; discrepancy: boolean }` (D5)
- `markHandedOff(conversationId)`

`SystemPromptService.build(clinic): string` (E1) — template mínimo parametrizado.

> Mapeo `conversation_messages` ↔ `LlmMessage`: `role` directo; `content` directo;
> `tool_calls` jsonb guarda los `toolCalls` (assistant) o `{toolCallId,name}`
> (tool). El resultado de la tool va en `content` (JSON). Esto reconstruye el
> contexto de function-calling entre turnos sin acoplarse a ningún proveedor.

---

## 7. Variables de entorno nuevas

```
REDIS_URL=                   # ahora REQUERIDO (cola + locks)
BOT_ACTOR_ID=                # uuid fijo del bot (auditoría runAsBot)
QUEUE_CONCURRENCY=5          # opcional; concurrencia global del worker
QUEUE_LOCK_TTL_MS=120000     # opcional; TTL del mutex (margen sobre peor caso); se renueva por heartbeat
QUEUE_CONTENTION_DELAY_MS=1000  # opcional; delay de reencolado al perder el lock
```

---

## 8. Qué deja listo este paso y qué no

Listo:
- `QueueModule` (BullMQ + Redis) + `RedisLockService` (mutex por conversación).
- Productor en el webhook (parse + filtro + enqueue con dedup).
- `WhatsappIncomingProcessor` (worker desacoplado, movible a `worker.ts`).
- `ConversationModule` real (routing, conversación, historial neutro, persistencia,
  patient_id con discrepancia→handoff).
- `SystemPromptService` mínimo.
- Manejo de reintentos, fallback y handoff.

No (Paso 7+):
- Persona y flujos completos del system prompt (Escenario 1/2).
- Prueba end-to-end real con el número de prueba.
- Respuesta a mensajes no-texto (hoy se descartan con log).
- FIFO estricto por grupo (hoy serialización best-effort por mutex).

---

## 9. Checklist para Claude Code

1. Deps: `bullmq`, `ioredis`, `@nestjs/bullmq`. `REDIS_URL` requerido + `BOT_ACTOR_ID`
   en `env.validation` (+ `QUEUE_CONCURRENCY`, `QUEUE_LOCK_TTL_MS` opcionales).
2. `QueueModule`: `BullModule.forRootAsync` (connection desde `REDIS_URL`) +
   `registerQueue('whatsapp-incoming')` + `RedisLockService` (SET NX PX + release Lua).
3. Productor: `WhatsappService.handleIncomingEvent` parsea, filtra (C2) y encola
   con `jobId=wa_message_id`, `attempts:3`, backoff exponencial.
4. `ConversationModule`: `ConversationService` (route/resolve/loadHistory/persistTurn/
   setPatientIfUnset/markHandedOff) + `SystemPromptService`. Mapeo neutro (D3).
5. `WorkerModule` + `WhatsappIncomingProcessor`: orquestación §5 (lock → ruteo →
   conversación → dedup → historial → prompt → ctx → runTurn → persistir →
   patient_id → enviar/handoff → unlock). Evento `failed` → fallback (A5).
6. Registrar los módulos en `AppModule`. Verificar que no haya dependencias
   circulares (WhatsappModule produce; WorkerModule consume e importa Whatsapp).
7. Confirmar compilación. (Prueba con Redis/BD real: Paso 7.)

---

## 10. Deudas técnicas anotadas (fuera de Paso 6)

| Deuda | Por qué se difiere | Requiere |
|---|---|---|
| FIFO estricto por conversación | Mutex da serialización (no-concurrencia) pero **no orden**. Cubre dos casos: (a) sin orden global entre conversaciones distintas; (b) **el reencolado bajo contención puede reordenar mensajes de la MISMA conversación** — si B pierde el lock y se difiere, C (posterior) podría tomarlo antes del reintento de B. Aceptable para MVP (mensajes del mismo usuario llegan espaciados) | BullMQ Pro Groups o cola por-conversación con orden FIFO |
| Respuesta a no-texto (audio/imagen/interactive) | MVP text-only | Manejo de tipos + transcripción/branching |
| Persona y flujos completos del prompt | Mínimo viable en Paso 6 | Paso 7 (Escenario 1/2) |
| Worker en proceso separado (`worker.ts`) | MVP mismo proceso (ya desacoplado) | Nuevo entrypoint + config de despliegue |
