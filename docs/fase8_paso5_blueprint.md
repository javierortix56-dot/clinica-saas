# FASE 8 — PASO 5: Lógica real de las 8 tools (Blueprint)

Plano para Claude Code. Objetivo del paso: reemplazar los **stubs** del Paso 4 por
la **lógica real** de las 8 tools, contra Postgres (Prisma + funciones/triggers
de la BD). Las reglas de negocio deterministas **viven en la BD** (triggers,
EXCLUDE, funciones); el backend orquesta y traduce. El criterio de "hecho" es:
compila, cada tool ejecuta su query/escritura real, y los errores de negocio
vuelven como `ToolResult` estructurado (no excepción).

> Continúa el Paso 4 (`docs/fase8_paso4_aimodule_blueprint.md`). Las firmas de las
> 8 tools, el loop con sus 4 guards y el `ToolExecutorService` ya existen; este
> paso cambia **qué hace cada tool por dentro**, no su contrato con el modelo.

---

## 0. Pre-requisitos y límites del paso

- **Esquema = migraciones SQL.** Workflow inmutable: migraciones en Supabase →
  `prisma db pull` → `prisma generate`. Prisma **nunca** crea/altera tablas. La
  única migración nueva de este paso es el **rol `clinic_bot`** (§2).
- **Sin cola todavía.** BullMQ + worker es Paso 6. Acá las tools son invocables
  por el `ToolExecutorService` del loop; el wiring con la cola viene después.
- **Prueba end-to-end (Escenario 2) es Paso 7.** Igual que con la `GEMINI_API_KEY`
  (blueprint Paso 4 §0) y el P1000 del pooler, puede que no se pueda probar
  contra la BD real en este paso; el criterio de "hecho" es compilación + lógica
  correcta + manejo de errores, validable con tests contra una BD de prueba.
- **Decisión de alcance MVP (B5):** la clínica opera con **un solo profesional
  activo**. Es una decisión de alcance del MVP, **no permanente**: el esquema
  sigue soportando N profesionales y la lógica no debe asumir cardinalidad 1 más
  allá del fallback de `proponer_turnos` sin `professional_id` (§5.E).

---

## 1. Decisiones cerradas

| # | Decisión | Resolución |
|---|---|---|
| A1 | Borde `clinical_notes` (§6 Paso 4) | Rol DB dedicado `clinic_bot` con `BYPASSRLS` + REVOKE sobre `clinical_notes`. **Sin cambios a RLS ni a `runAsActor`.** Code discipline como segunda capa |
| A2 | Dónde vive la lógica | Funciones reales en módulos de dominio (`PatientsModule`, `CatalogModule`, `SchedulingModule`); el `ToolExecutorService` **delega** vía DI a handlers inyectables |
| A3 | Lecturas vs escrituras | Lecturas: Prisma plano filtrando por `clinic_id`. Escrituras: dentro de `runAsBot` (auditoría) |
| A4 | Contrato de errores | Mapear excepciones de Postgres a `error_code` estable por **SQLSTATE / nombre de constraint**, nunca por el texto del `raise` |
| A5 | `slot_is_available` / SQL functions | Invocadas por `$queryRaw` (Prisma no tipa funciones SQL) |
| B1 | Orden de propuestas | Criterio = **adyacencia + colchón** (back-to-back con turnos existentes), no solo "más temprano". Top 3 |
| B2 | Ventana por defecto | 14 días desde *mañana* si faltan `desde/hasta` |
| B4 | Resolución de fase + cool-down | Fase = próxima pendiente derivada de `appointments`; inicio mínimo respeta `prior_appt.end_at + cooldown` |
| B5 | Profesional por defecto | MVP: único profesional activo. Sin filtro por especialidad |
| B6 | Prime time | `proponer_turnos` pre-excluye la franja prime si el paciente tiene ≥2 no-shows (espeja el trigger) |
| B7 | Fallback sin slots | `{ ok:false, error_code:'NO_SLOTS' }`; el modelo reintenta con ventana más amplia |
| C1 | Modificadores de tecnología | El bot agenda con **duración base** de la fase. Los +15 min (Escaneo 3D) los absorbe el médico dentro del "tiempo total de consulta"; no se calculan en Paso 5 |
| C2 | Resolución de tratamiento | `treatment_id` = tratamiento activo del paciente cuyo tipo contiene la fase; `>1` activo del mismo tipo → `AMBIGUOUS_TREATMENT` |
| C3 | `treatment_phase` | Se acepta por **nombre**, se resuelve a `phase_template_id` dentro del `treatment_type` correcto |
| C4 | Estado/origen del turno | `status='proposed'`, `origin='whatsapp_bot'` |
| D | `registrar_paciente` | **Idempotente**: DNI existente devuelve el paciente existente como éxito, no error |
| E | `iniciar_tratamiento` | Crea solo la fila `treatments` (`status='planned'`, `primary_professional_id=null`). No crea appointments ni instancias de fase |
| F | Flag prime time en historial | **Omitido**: el paciente con ≥2 no-shows no ve horarios prime (B6 los filtra silenciosamente); no se expone el motivo al bot |
| G | `consultar_catalogo` | `treatment_types` activos + `valuation_fee` + `currency`; framing "orientativo" |
| H | `consultar_politicas_clinica` | Sintetizado de columnas/triggers existentes; `puntualidad` = texto fijo "10 minutos de tolerancia" |

---

## 2. Migración nueva: rol `clinic_bot` (§A1)

Única migración SQL del paso. Archivo sugerido:
`supabase/migrations/0006_bot_role_least_privilege.sql`.

Intención: el bot escribe por `DATABASE_URL` con un rol que **bypassa RLS** (la
aislación tenant queda a nivel de código, como hoy), pero **no puede tocar
`clinical_notes`** ni siquiera por un bug, porque carece del GRANT.

```sql
-- Rol de conexión del bot: NOSUPERUSER + BYPASSRLS, sin acceso a notas clínicas.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'clinic_bot') then
    create role clinic_bot login bypassrls
      password '<seteado fuera de la migración / vault>';
  end if;
end $$;

-- Privilegios operativos mínimos sobre las tablas que el bot usa.
grant usage on schema public to clinic_bot;
grant select, insert, update on
  patients, treatments, appointments, appointment_modifiers,
  treatment_types, treatment_phase_templates, technology_modifiers,
  professionals, staff_members, clinics,
  professional_availability, availability_exceptions,
  conversations, conversation_messages, whatsapp_channels, audit_logs
to clinic_bot;
grant select on patient_risk_profile to clinic_bot;

-- Borde duro: el bot NUNCA puede leer ni escribir notas clínicas.
revoke all on clinical_notes from clinic_bot;
```

Notas:
- `set_config('app.actor_id'/'app.source', …, true)` de `runAsActor`/`runAsBot`
  funciona con cualquier rol de login (GUCs custom del namespace `app.*`): **el
  cambio de rol no rompe el seteo de contexto de auditoría** (verificado contra
  `prisma.service.ts` del Paso 2).
- `BYPASSRLS` evita el problema de que un rol sin JWT haga `auth_clinic_id()` →
  `null` → `tenant_all` bloquee todo. La aislación tenant sigue siendo
  responsabilidad del código: **toda query filtra por `clinic_id` explícito**.
- El password/credencial del rol se gestiona fuera del SQL versionado (vault /
  variable de entorno). `DATABASE_URL` del bot apunta a este rol.
- Ajustar la lista de tablas del `grant` a los nombres reales tras `db pull` si
  alguno difiere.

---

## 3. Arquitectura: del registro estático a handlers inyectables (§A2, A3)

Hoy (`Paso 4`) `TOOL_STUBS` es un `Record<ToolName, ToolStub>` estático y
`ToolExecutorService` enruta sobre él. En Paso 5 las tools necesitan DI
(`PrismaService`, servicios de dominio), así que:

1. Se define una interfaz `ToolHandler`:
   ```typescript
   interface ToolHandler {
     readonly name: ToolName;
     execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
   }
   ```
2. Cada tool real es un provider inyectable que `implements ToolHandler`, ubicado
   en su módulo de dominio:

   | Módulo | Handlers |
   |---|---|
   | `PatientsModule` | `buscar_paciente_por_dni`, `registrar_paciente`, `consultar_historial_paciente` |
   | `CatalogModule` | `consultar_catalogo`, `consultar_politicas_clinica` |
   | `SchedulingModule` | `proponer_turnos`, `agendar_turno`, `iniciar_tratamiento` |

   (`iniciar_tratamiento` toca tratamientos/fases; queda en `SchedulingModule`
   junto al resto del dominio de agenda/tratamiento. Alternativa: un
   `TreatmentsModule`. Decisión menor de implementación.)

3. `ToolExecutorService` recibe los handlers (p.ej. inyectando un array con un
   token `TOOL_HANDLERS`, o un `ToolRegistry`) y enruta por `name`. Mantiene su
   garantía: **valida args, inyecta `ctx`, y envuelve cualquier excepción como
   `ToolResult` `{ ok:false }`** (nunca propaga al loop).

4. Los módulos de dominio exportan sus handlers; `AiModule` los importa para
   poblar el registro. El loop (`ConversationLoopService`) no cambia.

**Validación de args:** los `args` vienen del modelo (no confiables). Cada handler
valida/coacciona su entrada (DTO con `class-validator` o validación manual) y, si
falta/está mal un campo, devuelve `{ ok:false, error_code:'INVALID_ARGS', … }`
antes de tocar la BD.

---

## 4. Contrato de errores (§A4)

Las tools traducen fallos de la BD a `error_code` estables, leyendo
**SQLSTATE / nombre de constraint**, no el texto en español de los `raise`.

| `error_code` | Origen en la BD | Cuándo |
|---|---|---|
| `INVALID_ARGS` | Validación en el handler | Falta/format inválido de un arg del modelo |
| `NOT_FOUND` | Query sin resultados | DNI/paciente/tratamiento/fase inexistente |
| `DUPLICATE_PATIENT` | `unique_violation` 23505 (`uq_patient_national_id`) | Solo defensivo: `registrar_paciente` ya hace pre-check idempotente (§5.F) |
| `OVERLAP` | `exclusion_violation` 23P01 (`appt_no_overlap`) | Slot pisado por otro turno (carrera) |
| `NO_AVAILABILITY` | `raise` de `enforce_availability` | Fuera de la disponibilidad del profesional |
| `PRIME_TIME_BLOCKED` | `raise` de `enforce_prime_time_restriction` | Paciente ≥2 no-shows en franja prime (no debería pasar si B6 filtró) |
| `SEQUENCE_VIOLATION` | `raise` de `validate_treatment_sequence` (fase previa faltante) | Agendar fase N sin fase N-1 |
| `COOLDOWN_VIOLATION` | `raise` de `validate_treatment_sequence` (cool-down) | Inicio antes de `prior.end_at + cooldown` |
| `AMBIGUOUS_TREATMENT` | Lógica del handler | `>1` tratamiento activo del mismo tipo (§5.H · C2) |
| `NO_SLOTS` | Lógica del handler | `proponer_turnos` sin resultados en la ventana (§5.E · B7) |
| `NOT_CONFIGURED` | Lógica del handler | Dato de política inexistente para el `tema` pedido |

Implementación: las funciones plpgsql `raise exception` sin SQLSTATE custom caen
en `P0001` (`raise_exception`); cuando varios triggers comparten `P0001`, se
distingue por un fragmento estable del mensaje o, mejor, **se considera agregar
`using errcode = '…'` a los triggers** en una migración futura para no depender
del texto. Para Paso 5: distinguir por `constraint`/SQLSTATE donde exista
(`23P01`, `23505`) y por chequeos previos del handler (cool-down/secuencia/prime
time se **pre-validan** en `proponer_turnos`, así que el camino feliz no llega al
`raise`; el `raise` queda como red de seguridad ante carreras).

---

## 5. Especificación por tool

> Cross-cutting: `clinic_id` y `actor` salen de `ctx` (jamás del modelo). Lecturas
> filtran por `ctx.clinicId`. Escrituras corren en `prisma.runAsBot(ctx.actor.actorId, tx => …)`.

### A. `buscar_paciente_por_dni` (R)
- **Query:** `patients WHERE clinic_id=ctx.clinicId AND national_id=dni AND deleted_at IS NULL`.
- **Resultado:** `{ found:true, patient:{ patient_id, dni, full_name, phone } }` o
  `{ found:false }`. `found:false` es **éxito** (`ok:true`), gatilla el flujo de
  paciente nuevo en el prompt.

### B. `consultar_catalogo` (R)
- **Query:** `treatment_types` activos (`is_active AND deleted_at IS NULL`) de la
  clínica + `clinics.valuation_fee` y `clinics.currency`. Si viene
  `treatment_type`, filtra `name ILIKE %…%`.
- **Resultado:** `{ valoracion:{ precio, moneda }, tratamientos:[{ name, description, price_min, price_max, moneda, orientativo:true }] }`.

### C. `consultar_politicas_clinica` (R) — sintetizado (§H)
- Mapeo por `tema` (si se omite, devuelve todos):
  - `precios` → rangos de `treatment_types.price_min/max` + `currency`.
  - `valoracion` → `clinics.valuation_fee` + `currency`.
  - `no_show` → regla prime time: "tras **2 ausencias** se restringen los horarios
    de mayor demanda" (umbral hardcodeado en trigger/vista) + franja
    `professionals.prime_time_start/end`.
  - `puntualidad` → **texto fijo**: "10 minutos de tolerancia".
- **Resultado:** `{ tema, politicas:[{ tema, texto, … }] }`.
- **Deuda técnica anotada:** tabla `clinic_policies` configurable por clínica
  (textos legales/disclaimers/puntualidad) — feature aparte, su propio blueprint.

### D. `consultar_historial_paciente` (R) — resumen seguro (§F, §6 Paso 4)
- **Query:** `treatments` (join `treatment_types`, `professionals`) + `appointments`
  (join `treatment_phase_templates`, `professionals`) del paciente en la clínica.
- **NUNCA** toca `clinical_notes` (code discipline + REVOKE del rol, §2).
- **Resultado:** `{ patient_id, tratamientos:[{ treatment_id, treatment_type, professional, estado, iniciado_en }], turnos:[{ fase, estado, fecha, professional }], clinical_notes_excluidas:true }`.
- **Sin** `no_show_count` / `restrict_prime_time` (§F: omitido, no se expone el motivo al bot).

### E. `proponer_turnos` (R) — el núcleo
Algoritmo:
1. **Resolver profesional(es):** si `professional_id` viene, ese; si no, el
   **único profesional activo** de la clínica (MVP B5: `staff_members.is_active`
   AND `professionals.deleted_at IS NULL`). Sin filtro por `specialties`.
2. **Resolver fase y duración (B4):** la fase objetivo es la **próxima pendiente**
   del tratamiento activo del paciente (menor `sequence_order` sin appointment
   no-cancelado). `duration_minutes` sale del `treatment_phase_templates` de esa
   fase. Si el modelo pasó `fase` explícita, se resuelve por nombre dentro del
   tipo. Solo fases `clinical` se proponen (`lab_wait` no ocupa sillón).
3. **Inicio mínimo (cool-down, Regla 1):** si hay fase previa con appointment,
   `min_start = prior_appt.end_at + cooldown acumulado`. Si no, `min_start = `
   inicio de la ventana.
4. **Ventana (B2):** `[desde ?? mañana, hasta ?? desde+14d]`.
5. **Grilla:** candidatos cada **15 min** dentro de la disponibilidad del
   profesional; para cada uno, `slot_is_available(prof, start, start+dur)` vía
   `$queryRaw`. Excluir solapamientos con appointments existentes
   (no-cancelados).
6. **Prime time (B6):** si el paciente tiene **≥2 no-shows**, excluir los
   candidatos dentro de `[prime_time_start, prime_time_end]` del profesional
   (silencioso; no se expone el motivo).
7. **Orden (B1 = adyacencia + colchón):** priorizar candidatos **back-to-back**
   con turnos existentes del profesional — es decir, cuyo `start` quede a
   `<= colchón` del `end_at` de un turno previo (o cuyo `end` quede a `<= colchón`
   del `start_at` del siguiente). **Colchón fijo configurable**, default **0–5 min**
   (p.ej. env `SCHEDULING_ADJACENCY_BUFFER_MIN=5`). Desempate: más temprano primero.
8. **Top 3.** Si no hay candidatos → `{ ok:false, error_code:'NO_SLOTS', message:'…ampliá la ventana…' }`.
- **Resultado:** `{ propuestas:[{ professional_id, start_at, end_at }] }`.
- **Deuda técnica anotada:** colchón **dinámico** basado en estadística histórica
  (no-show rate, duración real por fase) — requiere su propia migración de
  métricas y su propio blueprint. **No entra en Paso 5.**

### F. `registrar_paciente` (W) — idempotente (§D)
- **Pre-check:** `patients WHERE clinic_id AND national_id=dni AND deleted_at IS NULL`.
  Si existe → devolver ese paciente como **éxito** (`ok:true`, sin insertar).
- **Insert** (en `runAsBot`): `national_id=dni`, `full_name="nombre apellido"`,
  `phone=telefono ?? null`. `birth_date` no se setea.
- **Resultado:** `{ patient_id, full_name, dni, created:boolean }` (`created:false`
  si ya existía).

### G. `iniciar_tratamiento` (W) (§E)
- **Resolver `treatment_type`** por nombre/id dentro de la clínica.
- **Insert** (en `runAsBot`) en `treatments`: `status='planned'`,
  `primary_professional_id=null`. **No** crea appointments ni instancias de fase.
- **Resultado:** `{ treatment_id, treatment_type, status:'planned', fases:[{ name, sequence_order, phase_kind }] }`
  (las fases se leen del template para informar al modelo, no se materializan).

### H. `agendar_turno` (W)
1. **Resolver `treatment_id` (C2):** tratamiento **activo**
   (`status in ('planned','in_progress')`) del paciente cuyo `treatment_type`
   contiene la fase. Si hay `>1` del mismo tipo → `AMBIGUOUS_TREATMENT`.
2. **Resolver `treatment_phase` → `phase_template_id` (C3):** por nombre dentro
   del `treatment_type` del tratamiento.
3. **`end_at` (C1):** `start_at + duration_minutes` de la fase (**sin**
   modificadores de tecnología).
4. **Insert** (en `runAsBot`) en `appointments`: `status='proposed'`,
   `origin='whatsapp_bot'`, `treatment_id`, `phase_template_id`, `patient_id`,
   `professional_id`, `start_at`, `end_at`.
5. **Errores → ToolResult (C5/A4):** los triggers (`appt_no_overlap`,
   `enforce_availability`, `enforce_prime_time_restriction`,
   `validate_treatment_sequence`) son la red de seguridad. Mapear a `OVERLAP` /
   `NO_AVAILABILITY` / `PRIME_TIME_BLOCKED` / `SEQUENCE_VIOLATION` /
   `COOLDOWN_VIOLATION`. Ante `OVERLAP`/`NO_AVAILABILITY`, el modelo re-llama
   `proponer_turnos` (loop del Paso 4; nunca asume que un slot propuesto sigue
   libre — decisión #4 del backend blueprint).
- **Resultado:** `{ appointment_id, status:'proposed', start_at, end_at }`.

> **Cool-down / continuación día-siguiente:** sin excepción al trigger. El trigger
> valida lo que **el bot** agenda; la continuación manual (staff agenda directo
> en el panel) está fuera del flujo del bot y no requiere cambios.

---

## 6. Qué deja listo este paso y qué no

Listo:
- Migración `clinic_bot` (rol least-privilege + REVOKE `clinical_notes`).
- `ToolExecutorService` enrutando a handlers inyectables (DI).
- Las 8 tools con lógica real (Prisma + `$queryRaw` para funciones SQL).
- Contrato de errores mapeado por SQLSTATE/constraint.

No (Paso 6+):
- Cola BullMQ + worker uniendo webhook → loop → WhatsApp (Paso 6).
- Prueba end-to-end del Escenario 2 (Paso 7).
- Modificadores de tecnología en el cálculo de `end_at` (deuda anotada, C1).
- Colchón de adyacencia **dinámico** por estadística (deuda anotada, F/B1).
- Tabla `clinic_policies` configurable (deuda anotada, H).
- Excepciones al cool-down para continuación día-siguiente vía bot (manual hoy).

---

## 7. Checklist para Claude Code

1. Migración `0006_bot_role_least_privilege.sql` (rol `clinic_bot`, grants, REVOKE
   `clinical_notes`). Documentar que `DATABASE_URL` del bot usa este rol.
2. `prisma generate` (asumiendo schema ya introspectado; no re-`db pull` salvo
   cambio de tablas — el rol no cambia el esquema de tablas).
3. Interfaz `ToolHandler` + token/registro `TOOL_HANDLERS`; refactor de
   `ToolExecutorService` para enrutar por handlers inyectables.
4. Handlers de lectura: `buscar_paciente_por_dni`, `consultar_catalogo`,
   `consultar_politicas_clinica`, `consultar_historial_paciente`.
5. Handlers de escritura: `registrar_paciente` (idempotente), `iniciar_tratamiento`,
   `agendar_turno` (con resolución `treatment_id`/fase y mapeo de errores).
6. `proponer_turnos`: grilla + `slot_is_available` (`$queryRaw`) + cool-down +
   prime time (B6) + orden por adyacencia/colchón (B1) + top 3 / `NO_SLOTS`.
7. Mapeo de errores Postgres → `error_code` (§4), centralizado y reusable.
8. Validación de `args` por handler (`INVALID_ARGS`).
9. Confirmar compilación. Tests unitarios de la lógica pura (orden de propuestas,
   resolución de fase, idempotencia) con Prisma mockeado donde la BD no esté.

---

## 8. Deudas técnicas anotadas (fuera de Paso 5)

| Deuda | Por qué se difiere | Requiere |
|---|---|---|
| Colchón de adyacencia dinámico (estadística histórica) | Necesita métricas de no-show/duración real | Migración de métricas + blueprint propio |
| Tabla `clinic_policies` configurable | `puntualidad`/legales hoy son texto fijo | Migración + tool de lectura ampliada |
| Modificadores de tecnología en `end_at` | El médico absorbe los +15 min en el MVP | Definir UX de selección de modificador (bot vs recepción) |
| `using errcode` custom en triggers | Hoy se distingue por SQLSTATE/constraint/pre-check | Migración que toque las funciones plpgsql |
| Multi-profesional en `proponer_turnos` sin `professional_id` | MVP opera con 1 profesional activo | Filtro por `specialties` o tabla de capacidades profesional↔tratamiento |
| Continuación día-siguiente vía bot (excepción cool-down) | Hoy la hace el staff directo en el panel | Definir regla de excepción y cómo el bot la invoca |
