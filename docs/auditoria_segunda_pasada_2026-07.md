# Auditoría — segunda pasada (8 de julio 2026)

Continuación de `auditoria_general_2026-07.md`. Esta pasada verificó que los
fixes de julio siguen intactos, auditó la superficie agregada desde entonces y
ejecutó las mejoras en la rama `claude/app-audit-wp-alternative-rwlxdb`.

## Qué se hizo

### 1. Código muerto (aplicado)
- Borrados: `components/ui/{card,input,label}.tsx`, `shared/src/api-contracts.ts`,
  funciones muertas del calendario (`appointmentsForSlot`, `blocksForSlot`).
- Dependencias fuera: `cron`, `ts-node`, `tsconfig-paths` (backend),
  `@radix-ui/react-label` (frontend), `class-transformer`/`class-validator`
  duplicados en el root. `@types/express` declarado explícito.
- `knip.json` en el root: correr `npx knip` queda sin falsos positivos para
  futuras auditorías.

### 2. Seguridad (verificado + aplicado)
Verificado intacto: JWT con firma verificada en server actions (`getVerifiedClaims`
+ re-chequeo en BD), portal con mensaje genérico y rate limiting, helmet +
throttler, firma HMAC del webhook de WhatsApp, token de canal GCal con
comparación en tiempo constante, ownership en endpoints del portal, validación
de tipo/tamaño de adjuntos, sin secretos hardcodeados.

Advisor de seguridad de Supabase: quedan solo 2 ítems —
- `appointment_modifiers` sin policies (**intencional**, documentado en 0022).
- **PENDIENTE MANUAL**: activar "Leaked password protection" en
  Dashboard → Authentication → Providers → Email.

### 3. Performance (aplicado)
- **Migración 0023** (aplicada en producción): 31 policies RLS scopeadas a
  `authenticated` (antes se evaluaban también para `anon` sin ningún flujo que
  lo use) + 14 índices de cobertura para FKs sin indexar.
- **Router cache 30s** (`staleTimes.dynamic: 0 → 30`): navegación entre
  secciones instantánea; los cambios propios se siguen viendo al instante
  porque toda mutación pasa por Server Actions con `revalidatePath`.
- `provisionAuthUser`: búsqueda por email paginada (antes solo página 1 de 1000).

### 4. Organización del contenido (aplicado)
- Nueva pantalla de inicio **"Hoy"** (`/home`): agenda del día con el próximo
  turno resaltado, indicadores (turnos hoy / por aprobar / pacientes nuevos),
  login aterriza ahí. Patrón estándar del rubro (Jane App, SimplePractice).

### 5. Canal WhatsApp
Ver `canal_whatsapp_alternativas_2026-07.md` (costos y limitaciones de Twilio
como BSP + plan de acción). Solo análisis; sin cambios de código.

## Backlog que queda documentado (no bloqueante)

- Consolidar pares de policies permisivas para `authenticated` (separar las
  `FOR ALL` de escritura en INSERT/UPDATE/DELETE) — WARN restante del advisor.
- Lista de pacientes: el fetch trae todos los pacientes (7 columnas livianas).
  Umbral estimado: con >3.000–5.000 pacientes conviene paginar server-side con
  búsqueda `ilike`.
- `getWeekBounds` del calendario usa hora local del server (UTC en Vercel);
  la pantalla "Hoy" ya corta el día en zona de la clínica — unificar cuando se
  toque el calendario.
- Caché por clínica de catálogos casi estáticos (`unstable_cache` + tags).
- Los índices nuevos figuran como "unused" en el advisor: normal (recién
  creados); revisar en 1–2 meses con tráfico real y borrar los que sigan sin uso.
