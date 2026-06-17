# Fase 15 — Portal del paciente (DNI + OTP por email)

**Rama:** `claude/nifty-noether-v4ttsi`
**PR:** único contra `main`

---

## PASO 0 — Hallazgos del relevamiento

### `patients` (schema.prisma + 0001_core.sql)

Columnas actuales: `id`, `clinic_id`, `national_id`, `full_name`, `phone`, `birth_date`, `created_at`, `updated_at`, `deleted_at`.

- **Sin columna `email`** — se agrega en migración 0008.
- **Sin columna `document_id`** — el DNI se llama `national_id` (text). El código en `server.ts` lo aclara explícitamente.
- Unique constraint: `(clinic_id, national_id)` — el mismo DNI puede existir en clínicas distintas.
- RLS actual: policy `tenant_all` → `clinic_id = auth_clinic_id()`. Un paciente autenticado **no** tendrá `clinic_id` en su JWT, por lo que esta policy lo bloqueará. Se necesita policy adicional para el rol `patient`.

### `appointments` (schema.prisma)

Columnas relevantes: `id`, `clinic_id`, `patient_id`, `professional_id`, `treatment_id`, `phase_template_id`, `start_at`, `end_at`, `status`, `origin`.

RLS actual: `tenant_all` (SELECT + INSERT + UPDATE + DELETE por `clinic_id`) + `reception_no_close` (UPDATE).

El paciente necesita una policy `SELECT`-only por `patient_id`, sin requerir `clinic_id`.

### `user_role` enum (0001_core.sql + 0002)

Valores actuales tras migración 0002: `admin | doctor | reception`. **No existe `patient`.**

Agregar el valor requiere `ALTER TYPE user_role ADD VALUE 'patient'` — no se puede hacer dentro de una transacción en Postgres; la migración debe ejecutarse fuera de bloque transaccional o con `BEGIN`/`COMMIT` explícito.

### `auth_clinic_id()` y `auth_role()` (0001_core.sql líneas 38–46)

```sql
create or replace function auth_clinic_id() returns uuid
  select nullif(auth.jwt() ->> 'clinic_id', '')::uuid;

create or replace function auth_role() returns text
  select auth.jwt() ->> 'user_role';
```

Ambas leen claims **top-level** del JWT. Para el paciente, `auth_clinic_id()` retorna `null` (no tendrá `clinic_id` en su JWT) y `auth_role()` retornará `'patient'` si el hook lo inyecta.

### `getSessionAuth()` (lib/supabase/server.ts líneas 31–54)

Devuelve `{ hasSession: boolean, role: string | null }`. Decodifica el JWT manualmente (base64). **No devuelve `patient_id`** — se necesitará una función análoga `getPatientSession()` para el portal.

### Middleware actual (lib/supabase/middleware.ts)

Tres guards en orden:
1. Sin sesión + ruta ≠ `/login` → redirect `/login` (staff login).
2. Con sesión + ruta `/login` → redirect `/approvals`.
3. Con sesión + ruta `/settings` + `user_role ≠ admin` → redirect `/approvals`.

**Problema para el portal:** el guard (1) redirige `/portal/turnos` sin sesión a `/login` (staff), no a `/portal/login`. El guard (2) redirige al paciente que ya tiene sesión si accede a `/portal/login` hacia `/approvals` (incorrecto). Los tres guards deben excluir `/portal/*` de su lógica.

### Custom Access Token Hook (0007_custom_access_token_hook.sql)

El hook busca en `staff_members` por `auth_user_id`. Si no hay fila activa, emite el JWT **sin claims custom** (`clinic_id` ni `user_role`). Un usuario patient autenticado via OTP no tendrá fila en `staff_members`, por lo que el hook actual no inyecta nada en su JWT. La migración 0009 extiende el hook para que, cuando no haya `staff_member`, busque en `patients` por email y, si encuentra, inyecte `patient_id` y `user_role = 'patient'`.

---

## PASO 1 — BLUEPRINT

### 1. Árbol de archivos

```
supabase/migrations/
  0008_patient_email.sql              [NUEVO]
  0009_patient_portal_rls.sql         [NUEVO]

docs/
  fase15_portal_paciente_blueprint.md [NUEVO — este archivo]

frontend/app/
  (portal)/
    layout.tsx                        [NUEVO]
    login/
      page.tsx                        [NUEVO — Client Component, dos pantallas]
      actions.ts                      [NUEVO — Server Action: requestOtp]
    turnos/
      page.tsx                        [NUEVO — Server Component]

frontend/lib/supabase/
  server.ts                           [MODIFICAR — agregar getPatientSession()]
  middleware.ts                       [MODIFICAR — excluir /portal/* del guard staff]
```

**Sin cambios en:** `(dashboard)/layout.tsx`, `(dashboard)/patients/`, migrations existentes.

---

### 2. Migraciones

#### `0008_patient_email.sql`

Agrega `email text` nullable a `patients`. Nullable porque los pacientes existentes no tienen email; se carga desde el panel admin. Sin unique constraint global (dos clínicas distintas pueden tener el mismo paciente con el mismo email — el tenant lo aísla).

Contenido de la migración:
```sql
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS email text;
```

Nada más — simple adición de columna, sin índice (el lookup es puntual, un solo paciente a la vez en el flujo OTP).

#### `0009_patient_portal_rls.sql`

Siete operaciones en orden:

1. **Agregar `patient` al enum `user_role`** — `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'patient'`. Debe ejecutarse fuera de bloque transaccional en Postgres 12+ (Supabase lo soporta directamente en SQL Editor).

2. **Crear `auth_patient_id()`** — función análoga a `auth_clinic_id()` que lee `auth.jwt() ->> 'patient_id'` y retorna `uuid`. `SECURITY INVOKER`, `STABLE`.

3. **Policy SELECT en `patients` para rol patient** — el paciente solo ve su propia fila:
   ```sql
   CREATE POLICY patient_view_self ON patients
     FOR SELECT USING (id = auth_patient_id() AND auth_role() = 'patient');
   ```
   Se suma a `tenant_all` (políticas se evalúan con OR para SELECT).

4. **Policy SELECT en `appointments` para rol patient** — el paciente solo ve sus propios turnos:
   ```sql
   CREATE POLICY patient_view_own ON appointments
     FOR SELECT USING (patient_id = auth_patient_id() AND auth_role() = 'patient');
   ```

5. **Extender el Custom Access Token Hook** — `CREATE OR REPLACE` de `public.custom_access_token_hook`. Se agrega un bloque `ELSIF` después del `IF found` existente (staff members): si no hay staff activo, busca en `patients` por el email del usuario (`event -> 'claims' ->> 'email'`). Si encuentra paciente, inyecta `patient_id` (uuid como text) y `user_role = 'patient'`. Si hay múltiples pacientes con el mismo email en distintas clínicas, toma el primero por `created_at ASC` (deuda técnica documentada).

6. **Permisos en `auth_patient_id()`** — `GRANT EXECUTE` a `authenticated`, `anon`.

7. **`GRANT SELECT ON patients TO supabase_auth_admin`** — necesario para que el hook SECURITY DEFINER pueda leer la tabla `patients` al extender la función.

---

### 3. Flujo completo de autenticación

```
Paciente abre /portal/login
          │
          ▼ Pantalla 1
  Ingresa DNI (national_id)
          │
          ▼ Server Action: requestOtp(nationalId)
  SELECT email FROM patients
    WHERE national_id = $1
      AND email IS NOT NULL
    LIMIT 1
    (sin RLS — service role en Server Action)
          │
    ┌─────┴───────┐
    │ No existe   │ Existe + tiene email
    │ o sin email │
    ▼             ▼
  toast error   supabase.auth.signInWithOtp({
  "DNI no       email,
  encontrado"   options: { shouldCreateUser: true }
                })
                │
                ▼
  Supabase envía email con código OTP de 6 dígitos
  (SMTP interno Supabase: límite 3 emails/hora en plan free)
                │
                ▼ Pantalla 2
  Paciente ingresa código OTP
                │
                ▼ Cliente: supabase.auth.verifyOtp({ email, token, type: 'email' })
          ┌─────┴──────────────────┐
          │ Inválido / expirado    │ Válido
          ▼                       ▼
    toast "Código         JWT emitido con hook:
    incorrecto"           { patient_id, user_role: 'patient' }
                                  │
                                  ▼
                         redirect → /portal/turnos
```

**Consideración de seguridad:** `requestOtp` es un Server Action. La búsqueda en `patients` se hace con el cliente de Supabase (RLS activa para el usuario anon) o — si se requiere buscar sin restricción de tenant — con el cliente `service_role` desde el Server Action (la service key nunca llega al cliente). La spec recomienda `signInWithOtp` desde Server Action, lo cual es correcto y evita exponer la service key.

**`shouldCreateUser: true`:** crea un usuario en `auth.users` la primera vez que el paciente se autentica. Supabase vincula el usuario por email. En autenticaciones posteriores, reutiliza el mismo usuario.

---

### 4. Vista del paciente en `/portal/turnos`

Guard: sin sesión → redirect `/portal/login`. Con sesión pero `user_role ≠ 'patient'` → redirect `/portal/login` (evita que un staff logueado vea el portal).

Query (Server Component):
```
appointments
  WHERE patient_id = auth_patient_id()
  ORDER BY start_at DESC
  JOIN professionals → staff_members.full_name
  JOIN treatments → treatment_types.name (nullable)
  JOIN treatment_phase_templates.name (nullable)
```

Cada fila muestra:
- Fecha y hora (`start_at` formateada con `Intl.DateTimeFormat`)
- Nombre del profesional
- Tipo de tratamiento (o fase, si es turno de fase)
- Badge de estado:
  - `proposed` → amarillo (`warning` variant)
  - `confirmed` → verde (outline con clase verde)
  - `in_progress` → azul (`default`)
  - `completed` → gris (`secondary`)
  - `cancelled` → gris claro + texto tenue
  - `no_show` → rojo (`destructive`)

Sin botón de cancelación, sin historial clínico, sin datos de otros pacientes.

---

### 5. Middleware — cambios necesarios

Reglas adicionales para `/portal/*` que van ANTES de los guards del dashboard:

1. Si ruta empieza con `/portal/login`: dejar pasar siempre (no requiere sesión). Si tiene sesión y `user_role = 'patient'` → redirect `/portal/turnos`.
2. Si ruta empieza con `/portal/` (cualquier otra): si no hay sesión → redirect `/portal/login`. Si hay sesión → dejar pasar.
3. Excluir `/portal/*` de los guards dashboard (guardia de `/login` del staff y de `/settings`).

---

### 6. `getPatientSession()` en `server.ts`

Función análoga a `getSessionAuth()` para el portal:

```ts
async function getPatientSession(): Promise<{ hasSession: boolean; patientId: string | null }>
```

Decodifica el JWT manualmente y lee el claim `patient_id`. Se usa en `/portal/turnos/page.tsx` para el guard y para la query.

---

### 7. Layout del portal (`(portal)/layout.tsx`)

- Sin nav de staff, sin badge de rol, sin link de Ajustes.
- Fondo gris claro (`bg-slate-50`), contenido centrado (`max-w-md mx-auto`).
- Header minimalista: nombre de la clínica centrado (hardcodeado o leído de una variable de entorno `NEXT_PUBLIC_CLINIC_NAME`).
- Sin `getSessionAuth()` ni query a `staff_members` — el layout del portal no conoce el staff.

---

### 8. Deuda técnica

| Item | Descripción |
|---|---|
| SMTP Supabase (plan free) | Límite de 3 emails/hora. Para producción, configurar SMTP externo (Resend, SendGrid) en Supabase Dashboard → Settings → Auth → SMTP. No requiere cambio en el código. |
| `email` nullable en `patients` | Los pacientes existentes no tienen email. Requiere UI en el panel admin (`/patients/[id]`) para que el staff cargue el email del paciente. Sin eso, el portal no funciona para ellos. |
| Ambigüedad de email multi-tenant | Si el mismo email pertenece a pacientes en dos clínicas distintas, el hook toma el primero por `created_at ASC`. En producción con múltiples clínicas reales, esto puede ser incorrecto. Solución futura: incluir `clinic_id` en el flujo OTP (ej. URL con slug de clínica). |
| `shouldCreateUser: true` | Crea usuarios en `auth.users` para emails que nunca se registraron. Si un paciente cambia de email, su cuenta `auth.users` queda huérfana. Solución futura: vincular explícitamente `patients.auth_user_id` (como en `staff_members`). |
| Portal solo lectura | No hay cancelación de turnos, ni solicitud de nuevo turno. Dejar para siguiente fase. |
| Sin campo en admin para email de paciente | El campo `patients.email` existe en la BD pero no hay UI en `/patients/[id]` para editarlo. Requiere ampliar el formulario de edición de paciente (fuera del scope de esta fase). |

---

## Secuencia de implementación

1. `0008_patient_email.sql` (crear archivo)
2. `0009_patient_portal_rls.sql` (crear archivo)
3. `lib/supabase/server.ts` → agregar `getPatientSession()`
4. `lib/supabase/middleware.ts` → extender con guards `/portal/*`
5. `app/(portal)/layout.tsx`
6. `app/(portal)/login/actions.ts` → `requestOtp` Server Action
7. `app/(portal)/login/page.tsx` → Client Component dos pantallas
8. `app/(portal)/turnos/page.tsx` → Server Component
9. `npm run build` limpio
10. Commit + push + PR
