# Auditoría general de la aplicación — Julio 2026

Alcance: monorepo completo (`frontend` Next.js 14, `backend` NestJS 10, `shared`,
migraciones Supabase, CI/CD) más el advisor de seguridad del proyecto Supabase
en producción ("SaaS healt").

---

## 1. Resumen ejecutivo

La base es sólida: arquitectura limpia y bien documentada (blueprints por fase),
verificación de JWT por JWKS en el backend, RLS activo en todas las tablas,
firma HMAC validada en el webhook de WhatsApp, mutex distribuido en Redis para
las conversaciones, writes de turnos centralizados en el backend y validación
de variables de entorno al arranque.

Los riesgos más importantes no están en la arquitectura sino en los bordes:

| # | Hallazgo | Severidad |
|---|----------|-----------|
| 1 | Server Actions autorizan con claims de JWT **sin verificar firma** y luego ejecutan operaciones con service role | **Crítica** |
| 2 | Login del portal permite enumerar DNIs y disparar OTPs sin límite de tasa | **Alta** |
| 3 | Backend sin rate limiting ni headers de seguridad (helmet) | **Alta** |
| 4 | Hallazgos del advisor de Supabase (search_path mutable, SECURITY DEFINER ejecutable por anon, RLS sin policies en una tabla, leaked-password protection off) | **Alta** |
| 5 | Sin CI de calidad: no corre lint/typecheck/tests en PRs; deploy a prod sin gate | **Alta** |
| 6 | Cobertura de tests muy baja (~840 líneas de spec en backend, 0 en frontend) | **Media** |
| 7 | Tipos de Supabase sin generar (`Database = {}`): queries del frontend sin tipado | **Media** |
| 8 | Sin observabilidad: sin Sentry/APM, sin endpoint de health, solo Logger de Nest | **Media** |
| 9 | Envío de WhatsApp con credenciales globales por env (una sola clínica en la práctica) | **Media (escala SaaS)** |
| 10 | Zona horaria UTC-3 hardcodeada en el frontend | **Baja** |

---

## 2. Hallazgos de seguridad (detalle)

### 2.1 CRÍTICO — Autorización basada en JWT decodificado sin verificar

En `frontend/app/(dashboard)/staff/actions.ts` (`getSessionClaims` →
`requireOwner`) y en `frontend/lib/supabase/middleware.ts` (guard de
`/settings`) los claims `user_role` / `is_owner` / `clinic_id` se leen
decodificando el payload del `access_token` en base64, **sin verificar la
firma**:

```ts
const payload = JSON.parse(
  Buffer.from(session.access_token.split(".")[1], "base64").toString("utf8")
);
```

`getSession()` lee el token directamente de la cookie sin validarlo contra
Supabase. En el caso del middleware el impacto es bajo (gate de UI; RLS sigue
protegiendo los datos). Pero en `staff/actions.ts` el resultado de
`requireOwner()` habilita operaciones con **`createAdminClient()` (service
role, saltea RLS)**: crear usuarios de auth, resetear contraseñas, borrar
staff. Una cookie con un JWT forjado (`is_owner: true`) pasa el chequeo y
ejecuta esas operaciones privilegiadas, porque el token forjado nunca llega a
validarse contra Supabase en ese camino.

**Remediación:**
- Verificar la firma antes de confiar en los claims: `jose.jwtVerify` contra
  el JWKS del proyecto (mismo patrón que `SupabaseJwtGuard` del backend), o
  `supabase.auth.getClaims()` (valida por JWKS en versiones recientes de
  supabase-js).
- Como defensa en profundidad, re-verificar `is_owner` contra la tabla
  `staff_members` (con el id ya autenticado) antes de cualquier operación con
  service role.
- Unificar el patrón en un helper único (`lib/auth/claims.ts`) y eliminar las
  4+ copias de la decodificación manual.

### 2.2 ALTA — Enumeración de DNI + spam de OTP en el portal

`frontend/app/portal/login/actions.ts` (`requestOtp`):
- Responde distinto según el DNI exista o no → un atacante puede enumerar qué
  documentos están registrados en la clínica (dato sensible en salud).
- Envía el OTP con `shouldCreateUser: true` sin límite de tasa ni CAPTCHA →
  spam de emails y creación de usuarios arbitrarios.
- Devuelve el email asociado al DNI (`return { email }`) → un DNI ajeno revela
  el email del paciente.

**Remediación:** respuesta genérica ("Si el DNI está registrado, te enviamos un
código"), enmascarar el email (`j***@gmail.com`) si se muestra, rate limiting
por IP+DNI (Upstash Ratelimit o similar en el server action), y evaluar
CAPTCHA (Turnstile) en el form del portal.

### 2.3 ALTA — Backend sin rate limiting ni hardening HTTP

`backend/src/main.ts` no configura `@nestjs/throttler` ni `helmet`. Los
endpoints públicos (webhook WhatsApp GET/POST, callback OAuth de Google,
webhook de Google Calendar) y los autenticados quedan sin límite de tasa.

**Remediación:** `ThrottlerModule` global con overrides por ruta (webhooks con
límites amplios; auth/portal estrictos), `app.use(helmet())`, y
`app.enableShutdownHooks()` para cierres limpios en Railway.

### 2.4 ALTA — Hallazgos del advisor de seguridad de Supabase (proyecto en vivo)

Resultado de `get_advisors(security)` sobre el proyecto activo:

1. **`appointment_modifiers`: RLS habilitado sin policies** (INFO, pero
   revisar: si el staff debe leerla desde el frontend, hoy está bloqueada;
   si solo la usa el backend por Prisma, está bien y conviene documentarlo).
2. **8 funciones con `search_path` mutable** (`auth_clinic_id`, `auth_role`,
   `auth_is_owner`, `set_updated_at`, `validate_treatment_sequence`,
   `slot_is_available`, `enforce_prime_time_restriction`,
   `enforce_availability`). En funciones usadas por RLS/triggers es vector de
   escalada. Fix: `ALTER FUNCTION ... SET search_path = ''` (o `pg_catalog,
   public`) en una migración.
3. **`audit_trigger()` es SECURITY DEFINER ejecutable por `anon` y
   `authenticated`** vía `/rest/v1/rpc/audit_trigger`. Fix: `REVOKE EXECUTE ON
   FUNCTION public.audit_trigger() FROM anon, authenticated;`.
4. **Extensión `btree_gist` en schema `public`** — moverla a `extensions`.
5. **Leaked password protection deshabilitada** en Auth — activarla en el
   dashboard (HaveIBeenPwned).

> Nota: el advisor de **performance** falló con un error interno de Supabase
> (bug del linter, no de este proyecto). Reintentar más adelante.

### 2.5 Observaciones menores

- `patients/actions.ts:12` usa `getSession()` donde el resto usa `getUser()`;
  unificar en `getUser()` (o `getClaims()`) para no confiar en cookies sin
  validar.
- El matcher del middleware excluye solo assets; está bien, pero documentar
  que `/auth/callback` y `/privacy` quedan cubiertos a propósito.
- `.env` correctamente ignorados; no se encontraron secretos commiteados.

---

## 3. Calidad de ingeniería

### 3.1 CI/CD sin gate de calidad

- `deploy-frontend.yml` deploya a producción en cada push a `main` **sin
  correr build de verificación, lint ni tests antes**.
- `e2e.yml` es solo `workflow_dispatch` (manual).
- No existe workflow de PR: nada corre `tsc`, `next build`, `jest` ni ESLint.
- El backend ni siquiera tiene script `lint` (solo `format`).

**Remediación:** workflow `ci.yml` en PRs y push a `main` con jobs paralelos:
`backend` (tsc + jest + eslint), `frontend` (next build + eslint), `shared`
(tsc). Hacer el deploy de Vercel dependiente del CI verde.

### 3.2 Cobertura de tests

- Backend: 5 archivos spec, ~840 líneas, centrados en scheduling y el worker.
  Sin tests de `AppointmentsService.reschedule/createManual`, guards de auth,
  ni Google Calendar (el módulo más complejo y con más I/O externo).
- Frontend: **cero tests**. El grid del calendario (`CalendarGrid.tsx`, 556
  líneas, con `grid-utils.ts` puro) es el mejor candidato: la lógica pura ya
  está separada y es testeable barato.

### 3.3 Tipado del frontend contra Supabase

`frontend/lib/supabase/types.ts` es un placeholder (`Database = {}`); todas
las queries de supabase-js van sin tipos y el código compensa con casts `as`.
Fix barato y de alto impacto: `supabase gen types typescript` (hay tool MCP /
CLI) + commitear el archivo y regenerarlo en cada migración.

### 3.4 Tamaño/estructura de archivos

`appointments.service.ts` (519 líneas) y `CalendarGrid.tsx` (556) empiezan a
concentrar demasiado. No urgente, pero al tocarlos conviene extraer (p. ej.
sincronización GCal del servicio de turnos a un colaborador dedicado).

---

## 4. Operación y observabilidad

- **Sin endpoint de health** (`/healthz`): Railway no puede hacer healthchecks
  reales ni reinicios automáticos informados. Agregar `@nestjs/terminus` con
  chequeo de Prisma y Redis.
- **Sin tracking de errores**: ninguna integración Sentry/APM en frontend ni
  backend. Un error en el loop del bot de WhatsApp hoy solo se ve en los logs
  de Railway.
- **Logs**: Logger de Nest sin formato estructurado (JSON) ni correlación por
  conversación/turno. Suficiente para hoy; migrar a pino cuando haya más de
  una clínica activa.
- **Backups**: verificar PITR/backups diarios en el plan de Supabase (datos de
  salud; RPO importa).

---

## 5. Escalabilidad SaaS (multi-clínica)

- El **ruteo entrante** de WhatsApp ya es multi-tenant (`whatsapp_channels`
  mapea `phone_number_id → clinic_id`), pero el **envío** usa
  `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` globales por env → en
  la práctica una sola clínica puede enviar. Mover credenciales por clínica a
  Vault (mismo patrón que ya usa Google Calendar con `VaultService`).
- **Zona horaria** UTC-3 hardcodeada en `calendar/actions.ts` y otros puntos.
  Agregar `clinics.timezone` y derivar los offsets de ahí antes de salir de
  Argentina.
- Plantillas de recordatorio (`WHATSAPP_REMINDER_TEMPLATE_*`) también son
  globales; mismo tratamiento por clínica.

---

## 6. Plan de mejora propuesto

### Fase 1 — Seguridad (prioridad inmediata, ~1 semana)
1. Verificar firma del JWT en Server Actions y middleware (helper único con
   `jose`/`getClaims`); re-chequear `is_owner` contra BD antes de usar service
   role. **(2.1)**
2. Portal: respuesta genérica + rate limiting + email enmascarado en
   `requestOtp`. **(2.2)**
3. Migración SQL con los fixes del advisor: `SET search_path` en las 8
   funciones, `REVOKE EXECUTE` de `audit_trigger`, decisión sobre
   `appointment_modifiers`, mover `btree_gist`. Activar leaked-password
   protection en el dashboard. **(2.4)**
4. `ThrottlerModule` + `helmet` + shutdown hooks en el backend. **(2.3)**

### Fase 2 — CI y tipado (~1 semana)
5. Workflow `ci.yml` (lint + typecheck + tests + build en PRs); condicionar el
   deploy de Vercel al CI verde. ESLint en backend.
6. Generar `Database` types de Supabase y eliminar los casts `as` del
   frontend.
7. Tests: `AppointmentsService` completo (reschedule, createManual, cancel por
   paciente), guards de auth, y unit tests de `grid-utils.ts`.

### Fase 3 — Operación (~1 semana)
8. `/healthz` con Terminus (Prisma + Redis) y healthcheck en Railway.
9. Sentry en frontend y backend (DSN por env, sin PII en eventos — datos de
   salud).
10. Verificar backups/PITR de Supabase y documentar el runbook de restore.

### Fase 4 — Escala SaaS (a demanda, antes de la segunda clínica)
11. Credenciales de WhatsApp por clínica en Vault (envío y plantillas).
12. `clinics.timezone` y eliminación del UTC-3 hardcodeado.
13. Refactor incremental de `appointments.service.ts` (extraer sync GCal) y
    `CalendarGrid.tsx` cuando se los toque.
14. Re-correr el advisor de performance de Supabase y revisar índices con
    datos reales.

---

*Generado a partir de la revisión del código en la rama
`claude/app-audit-improvements-ouy1qh` y del advisor de seguridad del proyecto
Supabase activo, 2026-07-02.*
