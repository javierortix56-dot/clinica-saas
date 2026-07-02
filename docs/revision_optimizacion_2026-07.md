# Revisión de optimización, transiciones y visual — Julio 2026

Complementa `docs/auditoria_general_2026-07.md`. Acá el foco es rendimiento
percibido y real, transiciones/estados de carga y propuestas visuales.

---

## 1. Implementado en esta tanda (quick wins)

### 1.1 Fuentes self-hosted (velocidad de carga + CLS)
`app/layout.tsx` cargaba Hanken Grotesk e IBM Plex Mono con un
`<link rel="stylesheet">` a `fonts.googleapis.com` — render-blocking y con dos
round-trips extra (preconnect a googleapis + gstatic) en el critical path, más
layout shift al intercambiar la fuente. Se migró a `next/font/google`, que:
- Auto-hospeda los archivos de fuente en el propio dominio (cero pedidos a
  Google en runtime; mejor TTFB del CSS y privacidad).
- Inyecta las fuentes como CSS variables (`--font-sans` / `--font-mono`) que
  `tailwind.config.ts` ya referencia.
- Usa `display: swap` sin FOIT.

### 1.2 Deduplicación de queries en el servidor (menos round-trips a Postgres)
Se agregó `getCurrentProfessionalId()` envuelto en `cache()` de React. Antes,
para un profesional (doctor):
- **Calendario**: `getWeeklyAppointments`, `getWeeklyBlocks` y
  `getWeeklyAvailability` hacían **cada una** el mismo `SELECT` sobre
  `professionals` por `auth_user_id` → 3 consultas idénticas por carga.
- **Detalle de paciente**: `getClinicalNotes` repetía ese lookup además del que
  hace la note config.

Ahora se resuelve **una sola vez por request** (React dedupe). Ahorro: 2
round-trips en el calendario y 1 en el detalle de paciente, en cada navegación.

Además, `getSessionAuth()` ya estaba cacheado, así que la verificación del JWT
(`getClaims`) corre una vez por request pese a usarse en varias funciones.

> Nota: `getClaims()` verifica la firma localmente contra el JWKS asimétrico del
> proyecto (mismo esquema que el backend), así que reemplazar el decode manual
> del token **no agregó latencia de red** en el camino común.

---

## 2. Transiciones y estados de carga

### Estado actual (bueno)
- `app/(dashboard)/loading.tsx` da un skeleton instantáneo en toda navegación
  del dashboard (Next Suspense boundary). El portal tiene el suyo.
- `animate-fade-up` (0.3s) en el contenedor de cada página suaviza la entrada.
- Los formularios usan `useTransition` con estados "Guardando…", y `sonner`
  para feedback de éxito/error.

### Implementado en la segunda tanda
1. ~~**Skeletons por ruta**~~ ✅ `calendar/loading.tsx` (grilla semanal fantasma)
   y `patients/[id]/loading.tsx` (cabecera + tarjetas de nota).
2. ~~**Feedback optimista** en las acciones de turno~~ ✅ El sheet se cierra al
   instante y el progreso llega por `toast.promise` (loading → éxito/error);
   la grilla solo se refresca en éxito, así un rechazo del server no deja
   estado fantasma. Ídem cancelar del portal (botón se desactiva y se reactiva
   si falla).
3. ~~**Transición de vista de semana**~~ ✅ `key` por semana + `animate-fade-up`
   en ambas vistas del calendario.
4. **Línea de "ahora"** ✅ (extra): marcador rojo en la columna de hoy a la
   altura de la hora actual (TZ clínica), actualizado cada 30 s, solo tras
   hidratar (sin mismatch de SSR).

### Propuestas que siguen pendientes
- **`View Transitions API`** (Next 14 experimental / estable en 15): daría
  transiciones nativas entre lista→detalle de paciente sin librerías.
- **Modo oscuro**: la paleta ya vive en CSS variables de Tailwind; requiere
  definir los tokens `dark:` y un toggle persistido (localStorage + clase en
  `<html>`). Tarea mediana, mejor como tanda propia.

---

## 3. Rendimiento — observaciones adicionales (pendientes)

- **`getPatients()` sin paginación**: trae todos los pacientes de la clínica
  ordenados por nombre, tanto para la lista como para el combo de alta de turno
  en el calendario. Con miles de pacientes conviene paginar la lista (server
  component con `range()`) y, para el combo, un buscador con `ilike` server-side
  en vez de traer todo.
- **`listUsers({ perPage: 1000 })`** en `staff/actions.ts` (`provisionAuthUser`)
  para encontrar un usuario por email: es O(n) sobre todos los usuarios de auth.
  Usar `getUserByEmail` / filtro server-side cuando el volumen crezca.
- **Índices**: ya existe el de `appointments(status)` (migración 0020). Con
  datos reales, revisar índices compuestos para los filtros del calendario
  (`professional_id, start_at` con `status`), y re-correr el advisor de
  performance de Supabase (falló con un bug interno del linter al auditar;
  reintentar).
- **`export const dynamic = "force-dynamic"`** en todas las páginas del
  dashboard es correcto (dependen de la sesión), pero las lecturas de catálogos
  casi estáticos (tipos de tratamiento, especialidades) podrían cachearse por
  clínica con `unstable_cache` + tag de invalidación al editarlos.

---

## 4. Propuestas visuales

Basado en la estética actual (limpia, azul primario, tarjetas con sombra suave,
tipografía Hanken Grotesk). Ideas de mayor impacto y bajo costo:

1. **Modo oscuro.** El sidebar ya es oscuro; el resto es claro. Un theme dark
   con las CSS variables ya definidas (`--background`, `--foreground`, etc.)
   sería un diferenciador para uso nocturno en guardias.
2. **Densidad configurable** en listas (cómoda / compacta). Ya se compactaron
   varias vistas a mano; exponerlo como preferencia evita seguir ajustando px.
3. **Calendario**:
   - Línea de "ahora" (indicador horizontal de la hora actual) en la columna
     del día de hoy.
   - Colores de turno por profesional (además de por estado) cuando hay varios
     profesionales en la misma grilla — mejora el escaneo visual.
   - Vista de día (además de semana) para clínicas con agenda muy cargada.
4. **Estado vacío ilustrado**: hoy los "sin datos" son texto en una tarjeta.
   Un ícono + microcopy + CTA ("Registrá tu primer paciente") sube la
   percepción de producto.
5. **Avatares con color derivado del nombre** (hash → hue) en vez del azul
   uniforme: ayuda a distinguir pacientes/profesionales de un vistazo.
6. **Badges de estado con ícono** (no solo color) para accesibilidad de
   daltónicos: confirmado ✓, cancelado ✕, no-show ⊘.
7. **Skeleton shimmer** (gradiente animado) en vez del `animate-pulse` plano —
   detalle barato que se siente más premium.

---

## 5. Accesibilidad (transversal, rápido de sumar)

- Focus states visibles y consistentes (hoy varios botones custom no tienen
  `focus-visible` ring).
- Contraste de los textos `text-slate-400` sobre blanco: algunos quedan por
  debajo de AA para texto chico; subir a `slate-500` donde sea cuerpo.
- `aria-label` en los botones-ícono (el calendario ya lo hace; replicar en el
  resto).

---

*Generado durante la implementación de mejoras en la rama
`claude/app-audit-improvements-ouy1qh`, 2026-07-02. Los ítems de §1 están
implementados; §2–§5 son backlog propuesto.*
