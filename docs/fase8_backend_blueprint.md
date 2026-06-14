# Fase 8 — Blueprint del Backend (NestJS)

## Rol del backend

Es el cerebro que conecta WhatsApp ↔ IA ↔ Postgres. **No** contiene lógica de
negocio determinista (esa vive en la BD: triggers, EXCLUDE, funciones). El
backend orquesta: recibe mensajes, llama al LLM, ejecuta las funciones de IA
contra Postgres, y responde por WhatsApp.

## Stack del backend

| Pieza | Elección | Por qué |
|---|---|---|
| Framework | **NestJS** | Estructura modular, escala con la complejidad |
| Acceso a datos | **Prisma** (con `db pull`) | Las migraciones SQL son la fuente de verdad del esquema; Prisma solo introspecta y genera tipos. NO usar Prisma Migrate. |
| Cola de trabajos | **BullMQ + Redis** | WhatsApp exige responder el webhook en segundos; el procesamiento (LLM + BD) va asíncrono |
| Cliente LLM | Abstracción propia | Gemini detrás de una interfaz, intercambiable por Anthropic/OpenAI |
| WhatsApp | Meta Cloud API (fetch/axios) | Envío de mensajes + verificación de webhook |

## Estructura de módulos

| Módulo | Responsabilidad |
|---|---|
| `WhatsappModule` | Controller del webhook (GET verify + POST mensajes), verificación de firma, cliente para enviar mensajes a Meta |
| `ConversationModule` | Gestiona `conversations` / `conversation_messages`; enruta `phone_number_id → clinic_id` |
| `AiModule` | Cliente LLM + loop de function calling + definiciones de las 8 herramientas |
| `SchedulingModule` | Implementa `proponer_turnos` y `agendar_turno` (llama a `slot_is_available`, deja turnos en `proposed`) |
| `PatientsModule` / `CatalogModule` | Funciones de lectura (`buscar_paciente_por_dni`, `consultar_catalogo`, etc.) |
| `DatabaseModule` | `PrismaService` + helper de contexto de actor (ver abajo) |
| `ConfigModule` | Variables de entorno tipadas y validadas |

## Flujo de un mensaje entrante

1. Meta envía POST al webhook con el mensaje.
2. El controller **verifica la firma** (`X-Hub-Signature-256` con el App Secret) y responde **200 inmediato**.
3. Encola el mensaje en BullMQ (dedup por `wa_message_id`).
4. El worker:
   a. Resuelve `clinic_id` desde `phone_number_id` (`whatsapp_channels`).
   b. Carga/crea la `conversation` y su historial.
   c. Llama al LLM con el historial + las 8 herramientas.
   d. Ejecuta las funciones que el LLM pida (contra Postgres).
   e. Devuelve la respuesta del LLM al paciente vía Meta API.
   f. Persiste el intercambio en `conversation_messages`.

## Decisiones clave

1. **El esquema lo poseen las migraciones SQL, no Prisma.** Workflow: correr las
   migraciones en Supabase → `prisma db pull` → `prisma generate`. Prisma nunca
   crea ni altera tablas.

2. **Contexto de actor para auditoría.** El bot escribe con la `service_role`
   (bypassa RLS). Para que `audit_logs` atribuya correctamente, cada escritura
   debe correr dentro de una transacción que fije:
   ```sql
   select set_config('app.actor_id', '<bot_or_staff_uuid>', true);
   select set_config('app.source', 'whatsapp_bot', true);
   ```
   En Prisma: usar `$transaction` interactiva y ejecutar esos `set_config` antes
   de la escritura.

3. **Idempotencia.** El índice único `uq_wa_message` (sobre `wa_message_id`) ya
   descarta reenvíos de Meta. El worker debe tolerar duplicados sin re-procesar.

4. **Resiliencia de agenda.** Si `agendar_turno` devuelve `error: 'overlap'`
   (carrera con otro actor), el worker re-llama `proponer_turnos` y ofrece
   alternativas. Nunca asume que un slot propuesto sigue libre.

5. **Turnos siempre `proposed`.** El bot no confirma; recepción aprueba en el panel.

## Variables de entorno (.env)

```
# Postgres / Supabase
DATABASE_URL=            # connection string (pooler) para runtime
DIRECT_URL=             # connection string directa para prisma db pull
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# WhatsApp Cloud API
WHATSAPP_PHONE_NUMBER_ID=1224374210748218
WHATSAPP_BUSINESS_ACCOUNT_ID=2483689102095634
WHATSAPP_ACCESS_TOKEN=          # temporal ahora; permanente (System User) luego
WHATSAPP_VERIFY_TOKEN=          # string que vos elegís, para verificar el webhook
WHATSAPP_APP_SECRET=            # de Settings > Basic, para validar la firma

# LLM
LLM_PROVIDER=gemini             # 'gemini' | 'anthropic' | 'openai'
GEMINI_API_KEY=                 # de Google AI Studio (aistudio.google.com)

# Infra
REDIS_URL=
PORT=3000
```

## Hosting

El bot es un servicio de larga duración (webhook + worker de cola), no
serverless. Recomendación: **Railway** (Node + add-on de Redis en un click) o
Render/Fly. El frontend (Fase 9) sigue en Vercel; son despliegues separados.

## Orden de construcción sugerido (en Claude Code)

1. Scaffold NestJS + Prisma (`db pull` del esquema existente) + estructura de módulos.
2. `DatabaseModule` con `PrismaService` y helper de contexto de actor.
3. `WhatsappModule`: webhook (verify + recepción) y envío de mensajes.
4. `AiModule`: cliente LLM + loop de function calling con las 8 herramientas (stubs).
5. Implementar las funciones de lectura, luego `proponer_turnos` y `agendar_turno`.
6. Cola BullMQ + worker uniendo todo.
7. Probar el Escenario 2 (urgencia) end-to-end con el número de prueba.
