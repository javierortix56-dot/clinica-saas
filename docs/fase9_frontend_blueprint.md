# Fase 9 — Blueprint del Frontend (Next.js)

> Documento de diseño. **No** incluye implementación: define la arquitectura, el
> alcance del MVP y las decisiones diferidas para el panel de staff de la clínica.

## Rol del frontend

Es el panel interno que usa el **staff** de la clínica (no los pacientes). Los
pacientes interactúan exclusivamente por WhatsApp (Fase 8). El frontend cubre lo
que el bot no puede resolver solo: **aprobar turnos propuestos**, consultar
**pacientes** y administrar la clínica.

Principio rector (heredado del backend): **la lógica de negocio determinista vive
en la BD** (RLS, triggers, `EXCLUDE`, funciones). El frontend no reimplementa
reglas; lee con RLS y delega las escrituras sensibles (turnos) al backend NestJS.

---

## 1. Estructura del monorepo

El repo pasa de single-package (`backend/`) a monorepo con `frontend/` al lado:

```
clinica-saas/
├── backend/            # NestJS (Fase 8) — sin cambios estructurales
├── frontend/           # Next.js 14 (App Router) — NUEVO
├── shared/             # Tipos compartidos FE ↔ BE — NUEVO
├── supabase/           # Migraciones SQL (fuente de verdad del esquema)
├── docs/
└── README.md
```

### Stack del frontend

| Pieza | Elección | Por qué |
|---|---|---|
| Framework | **Next.js 14** (App Router) | Server Components, layouts anidados, route handlers; estándar del ecosistema React |
| UI | **shadcn/ui** | Componentes copiados al repo (no dependencia opaca), accesibles, sobre Radix |
| Estilos | **Tailwind CSS** | Utility-first; shadcn/ui lo asume |
| Cliente de datos | `@supabase/supabase-js` + `@supabase/ssr` | Reads con RLS; sesión persistida vía cookies en SSR |
| HTTP al backend | `fetch` nativo | Writes de turnos contra endpoints NestJS |
| Validación | **zod** | Esquemas compartibles con el backend vía `shared/` |

### Setup de Next.js 14

- **App Router** (`app/`), no Pages Router.
- **Server Components por defecto**; `"use client"` solo donde haga falta
  interactividad (formularios, botón de refresco, estado local).
- TypeScript estricto (`strict: true`).
- Tailwind + `globals.css` con las variables de tema de shadcn/ui.
- `components.json` de shadcn/ui apuntando a `components/ui/`.

### Tipos compartidos (`shared/`)

Un paquete liviano de **solo tipos** (sin runtime salvo esquemas zod) consumido
por ambos lados:

- Tipos de dominio: `Appointment`, `Patient`, `Clinic`, `StaffRole`, estados
  (`proposed | confirmed | …`).
- Contratos de los endpoints NestJS de escritura (request/response DTOs).
- Esquemas **zod** reutilizables para validar en FE y BE.

> Los tipos de las **tablas** de Supabase (filas/relaciones) se generan aparte con
> `supabase gen types typescript` y viven en `frontend/` (lib del cliente
> Supabase). `shared/` es para contratos de API y tipos de dominio, no para el
> reflejo del esquema.

---

## 2. Autenticación

**Supabase Auth** como proveedor de identidad. La pieza clave es el **Custom
Access Token Hook** que inyecta `clinic_id` (y el rol) en el JWT, para que RLS
pueda filtrar por clínica sin un round-trip extra.

### Custom Access Token Hook

Un hook de Postgres (configurado en Supabase Auth) que, al emitir un access token,
agrega claims a partir de la membresía del usuario (`staff_members`):

```
JWT claims (custom):
  clinic_id: <uuid de la clínica del staff>
  user_role: admin | professional | reception
```

Esto convierte al JWT en la **fuente de verdad del tenant**: toda query con RLS
lee `clinic_id` desde el token, nunca desde un parámetro manipulable por el cliente.

### Flujo completo

1. **Login**: el usuario ingresa email + password en la vista de Login.
   `supabase.auth.signInWithPassword()`.
2. Supabase valida y, al emitir el access token, **dispara el hook** que inyecta
   `clinic_id` y `user_role` en el JWT.
3. El JWT (con esos claims) queda en la **sesión** (cookies vía `@supabase/ssr`).
4. **Reads**: el cliente Supabase del frontend usa ese JWT en cada query; **RLS**
   en Postgres filtra automáticamente por `clinic_id` del token.
5. **Writes de turnos**: el frontend manda el JWT como `Authorization: Bearer` a
   los endpoints NestJS, que validan el token y aplican el mismo `clinic_id`.

### Registro solo por invitación

**No hay signup público.** El staff se crea por invitación:

- Un `admin` invita por email (Supabase Auth invite / creación administrada).
- El usuario invitado setea su password vía el link de invitación.
- Su `clinic_id` y rol provienen de la fila en `staff_members` que el admin creó;
  el hook los refleja en el JWT.

### Roles en el JWT

| Rol | Descripción |
|---|---|
| `admin` | Dueño/gestor de la clínica. Acceso total al panel y a la administración. |
| `professional` | Profesional clínico. Ve **solo** sus propios pacientes y turnos. |
| `reception` | Recepción/secretaría. Gestiona la bandeja de aprobaciones y pacientes. |

---

## 3. Política de acceso a datos

Regla general: **leer es directo (con RLS), escribir lo sensible es vía backend.**

| Operación | Vía | Enforcement |
|---|---|---|
| **Reads** (pacientes, turnos, catálogo, etc.) | Directo a Supabase desde el frontend | **RLS** filtra por `clinic_id` del JWT |
| **Writes de turnos** (crear/modificar appointments) | **Exclusivamente** endpoint NestJS (`POST /appointments`, etc.) | El backend valida reglas (`slot_is_available`, cool-down, prime time) y deja el turno en `proposed`. **Nunca** escritura directa a Supabase. |
| **Aprobación `proposed → confirmed`** | Endpoint NestJS dedicado (`POST /appointments/:id/confirm`) | El backend valida la transición de estado y la autorización del rol |
| **Writes administrativos** (config de clínica, alta/baja de staff) | Directo a Supabase con RLS | RLS restringe a `admin` (por rol en el JWT) |

### Por qué los turnos no van directo a Supabase

La disponibilidad y las reglas de agenda (solapamientos vía `EXCLUDE`, cool-down
entre fases, prime time por ausencias) son **lógica de negocio** que el backend ya
implementa en Fase 8. Permitir escritura directa desde el frontend duplicaría —y
desincronizaría— esas reglas. El backend es el **único** camino de escritura de
turnos para garantizar consistencia.

Las escrituras administrativas, en cambio, son CRUD simple sin reglas de agenda:
RLS por rol alcanza, sin necesidad de un endpoint dedicado.

---

## 4. Alcance MVP — vistas

Solo **tres** vistas, en este orden de prioridad:

1. **Login** — autenticación del staff (sección 2).
2. **Bandeja de aprobaciones pendientes** — turnos en estado `proposed` esperando
   confirmación del staff. Es la vista de mayor valor: cierra el loop del bot
   (el bot propone, el humano aprueba).
3. **Vista de pacientes** — listado + detalle básico (datos de contacto, historial
   resumido de tratamientos/turnos).

### Explícitamente FUERA del MVP

- ❌ Vista de **calendario**.
- ❌ **Supabase Realtime**.
- ❌ **Notificaciones push**.

---

## 5. Estrategia de datos en MVP

- **Polling manual**: la bandeja de aprobaciones se refresca con un botón
  **"Actualizar"** (no auto-refresh, no suscripciones).
- **Sin Supabase Realtime** por ahora. La latencia de "enterarse" de un turno
  nuevo es aceptable para el MVP (el staff abre el panel y actualiza).
- Reads vía Server Components / cliente Supabase; el botón "Actualizar" dispara un
  re-fetch (router refresh o re-query del lado cliente).

Racional: Realtime agrega complejidad (canales, manejo de reconexión, estado
optimista) que no justifica el MVP. Polling manual es trivial y suficiente para
validar el flujo de aprobación.

---

## 6. Estructura de carpetas propuesta

Convenciones de Next.js App Router:

```
frontend/
├── app/
│   ├── layout.tsx                # Layout raíz (providers, tema)
│   ├── globals.css               # Tailwind + variables de shadcn/ui
│   ├── login/
│   │   └── page.tsx              # Vista de Login (pública)
│   ├── (dashboard)/              # Grupo protegido (requiere sesión)
│   │   ├── layout.tsx            # Layout del panel (nav, guard de sesión/rol)
│   │   ├── approvals/
│   │   │   └── page.tsx          # Bandeja de aprobaciones (admin, reception)
│   │   └── patients/
│   │       ├── page.tsx          # Listado de pacientes
│   │       └── [id]/
│   │           └── page.tsx      # Detalle de paciente
│   └── api/                      # Route handlers (proxy/auxiliares si hace falta)
├── components/
│   ├── ui/                       # Componentes de shadcn/ui (generados)
│   └── ...                       # Componentes de dominio (tablas, cards)
├── lib/
│   ├── supabase/
│   │   ├── client.ts            # Cliente para Client Components
│   │   ├── server.ts            # Cliente para Server Components (cookies/ssr)
│   │   └── types.ts             # Tipos generados del esquema (supabase gen types)
│   ├── api.ts                    # Wrapper de fetch hacia endpoints NestJS
│   └── rbac.ts                   # Helpers de autorización por rol
├── middleware.ts                 # Refresh de sesión + guard de rutas protegidas
├── components.json               # Config de shadcn/ui
├── tailwind.config.ts
├── next.config.js
├── tsconfig.json
└── package.json
```

```
shared/                            # Tipos/contratos compartidos FE ↔ BE
├── src/
│   ├── domain.ts                 # Appointment, Patient, StaffRole, estados...
│   ├── api-contracts.ts          # DTOs de los endpoints de escritura de NestJS
│   └── schemas.ts                # Esquemas zod reutilizables
├── index.ts
├── tsconfig.json
└── package.json
```

> **Dónde van los tipos compartidos**: en `shared/` (raíz del monorepo),
> importable por `frontend/` y `backend/`. Los tipos del **esquema de Supabase**
> (reflejo de tablas) viven en `frontend/lib/supabase/types.ts`, generados con
> `supabase gen types`.

---

## 7. RBAC en la UI

El JWT trae `user_role`; la UI lo usa para mostrar/ocultar y para guards de ruta.
**La UI no es la barrera de seguridad** (eso es RLS + validación en el backend);
el RBAC en UI es para **experiencia** (no mostrar lo que el usuario no puede usar).

| Capacidad | `admin` | `reception` | `professional` |
|---|:---:|:---:|:---:|
| Login / acceder al panel | ✅ | ✅ | ✅ |
| **Bandeja de aprobaciones** | ✅ | ✅ | ❌ |
| Aprobar turno `proposed → confirmed` | ✅ | ✅ | ❌ |
| Ver **todos** los pacientes de la clínica | ✅ | ✅ | ❌ |
| Ver **solo sus propios** pacientes/turnos | — | — | ✅ |
| Administración (config de clínica, staff) | ✅ | ❌ | ❌ |

Notas:

- La **bandeja de aprobaciones es solo para `admin` y `reception`**. Un
  `professional` que navegue a `/approvals` debe ser redirigido (guard en el
  layout del grupo `(dashboard)` o en `middleware.ts`).
- Los **profesionales ven solo sus propios pacientes y turnos**. Esto se enforcea
  en **RLS** (filtro por `professional_id` ligado al `staff_member` del JWT); la
  UI simplemente refleja lo que la query devuelve.
- El doble enforcement (RLS + UI) es intencional: aunque la UI fallara, RLS impide
  el acceso a datos de otra clínica o de pacientes ajenos.

---

## 8. Decisiones diferidas (no MVP)

Se posponen explícitamente a **v2** (o posterior):

- **Supabase Realtime** — auto-actualización de la bandeja y otras vistas en vivo,
  reemplazando el polling manual.
- **Vista de calendario** — agenda visual de turnos por profesional/día.
- **Notificaciones push** — avisos al staff (web push / email) de turnos nuevos o
  cambios.
- **App móvil** — cliente nativo/PWA para el staff.

Estas quedan fuera de alcance hasta validar el flujo central (login → aprobar
turnos → consultar pacientes) con el MVP.
