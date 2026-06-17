# Fase 11 — Detalle de Turno (Sheet lateral en /calendar)

**Rama de implementación:** `claude/nifty-noether-v4ttsi`
**PR:** separado, contra `main`
**Acceso:** solo rol `doctor` (hereda el guard de `/calendar`)

---

## 1. Contexto

`/calendar` ya muestra la grilla semanal de turnos confirmados del doctor. Esta
fase agrega **profundidad clínica**: al hacer click en una card de turno se abre
un panel lateral (Sheet) con la información completa del turno, la **línea de
tiempo de fases del tratamiento** con su estado calculado, el historial de turnos
del paciente para ese tratamiento, e indicadores de alerta.

Todo el cálculo de estado de fases ocurre **en el cliente** a partir de datos
traídos vía el cliente Supabase del browser (RLS filtra por `clinic_id` del JWT).
**No se agrega ningún endpoint nuevo en NestJS.**

---

## 2. Modelo de datos relevante (ya existente)

```
treatments
  id, clinic_id, patient_id, treatment_type_id, primary_professional_id, status

treatment_phase_templates              (las "fases" de un tipo de tratamiento)
  id, clinic_id, treatment_type_id, sequence_order, name,
  phase_kind (clinical | lab_wait), duration_minutes?, cooldown_days (default 0)

appointments
  id, clinic_id, treatment_id?, phase_template_id?, patient_id, professional_id,
  start_at, end_at, status (proposed|confirmed|in_progress|completed|cancelled|no_show)

patients
  id, full_name, phone, ...
```

**Cadena de resolución del turno → fases:**

```
appointment.treatment_id ─→ treatments.treatment_type_id ─┐
                                                          ├─→ treatment_phase_templates
appointment.phase_template_id ─→ phase_template.treatment_type_id ─┘   (todas, ORDER BY sequence_order)
```

El `treatment_type_id` se deriva del `treatment` del turno; si el turno no tiene
`treatment_id` pero sí `phase_template_id`, se deriva desde la fase. Si no tiene
ninguno (turno suelto sin tratamiento), la sección de fases muestra estado vacío.

---

## 3. Capa de datos (cliente)

`AppointmentSheet` es un Client Component. Hace **un fetch** al abrirse, disparado
por `useEffect([appointmentId])`. Usa `createClient()` de `lib/supabase/client.ts`
(browser client; RLS aplica con el JWT del usuario → nunca se pasa `clinic_id`).

### 3.1 Query A — el turno + paciente + tratamiento

```ts
const { data: appt } = await supabase
  .from("appointments")
  .select(`
    id, start_at, end_at, status, treatment_id, phase_template_id, patient_id,
    patients ( id, full_name, phone ),
    treatments ( id, treatment_type_id, treatment_types ( name ) ),
    treatment_phase_templates ( id, treatment_type_id, name )
  `)
  .eq("id", appointmentId)
  .single();
```

`treatmentTypeId = appt.treatments?.treatment_type_id ?? appt.treatment_phase_templates?.treatment_type_id ?? null`

### 3.2 Query B — todas las fases del tipo de tratamiento

```ts
const { data: phases } = await supabase
  .from("treatment_phase_templates")
  .select("id, sequence_order, name, phase_kind, duration_minutes, cooldown_days")
  .eq("treatment_type_id", treatmentTypeId)
  .order("sequence_order", { ascending: true });
```

(solo si `treatmentTypeId != null`)

### 3.3 Query C — historial de turnos del paciente para este tratamiento

Si el turno tiene `treatment_id`, filtramos por tratamiento (lo más preciso). Si
no, caemos a `patient_id` para no quedarnos sin historial.

```ts
let q = supabase
  .from("appointments")
  .select("id, start_at, end_at, status, phase_template_id, treatment_phase_templates ( name )")
  .order("start_at", { ascending: false });

q = appt.treatment_id
  ? q.eq("treatment_id", appt.treatment_id)
  : q.eq("patient_id", appt.patient_id);

const { data: history } = await q;
```

### 3.4 Query D — conteo de no-shows del paciente (alerta prime time)

```ts
const { count: noShowCount } = await supabase
  .from("appointments")
  .select("id", { count: "exact", head: true })
  .eq("patient_id", appt.patient_id)
  .eq("status", "no_show");
```

Las cuatro queries pueden lanzarse con `Promise.all` tras resolver A (B/C/D
dependen de datos de A).

---

## 4. Cálculo de estado de fases (cliente, puro)

Para cada fase `p` (ordenada por `sequence_order`), se calcula uno de cuatro
estados, evaluados **en este orden de prioridad**:

| Estado | Condición | Visual |
|---|---|---|
| **activa** | `p.id === appt.phase_template_id` | punto lleno slate-900, "En curso" |
| **completada** | existe en `history` un appointment con `phase_template_id === p.id` y `status ∈ {confirmed, completed}` (y no es la activa) | check, slate-400 |
| **bloqueada** | la fase anterior `p-1` tiene `cooldown_days > 0` **y** `hoy < (start_at del último appointment de p-1) + cooldown_days` | candado, ámbar + fecha disponible |
| **pendiente** | ninguna de las anteriores | punto hueco, slate-300 |

### 4.1 Detalle de "bloqueada" y fecha disponible

```ts
// fase anterior por sequence_order
const prev = phases[i - 1];
if (prev && prev.cooldown_days > 0) {
  const prevAppt = lastAppointmentForPhase(history, prev.id); // más reciente
  if (prevAppt) {
    const available = addDays(new Date(prevAppt.start_at), prev.cooldown_days);
    if (now < available) {
      // BLOQUEADA → mostrar "Disponible desde {formatDate(available)}"
    }
  }
}
```

`lastAppointmentForPhase` = el appointment más reciente (por `start_at`) en
`history` cuyo `phase_template_id === prev.id` con status realizado
(`confirmed|completed|in_progress`). Si la fase anterior aún no se realizó, no se
bloquea por cooldown (no hay desde cuándo contar) → cae a pendiente.

### 4.2 Resultado tipado

```ts
type PhaseState = "active" | "completed" | "blocked" | "pending";

interface PhaseView {
  id: string;
  name: string;
  phase_kind: "clinical" | "lab_wait";
  duration_minutes: number | null;
  cooldown_days: number;
  state: PhaseState;
  availableFrom: string | null; // ISO, solo si state === "blocked"
}
```

---

## 5. Indicadores de alerta

### 5.1 Restricción prime time (no-shows)

```ts
if (noShowCount >= 2) → <Badge variant="destructive">Restricción prime time</Badge>
```

Badge rojo en la cabecera del sheet. Semántica: el paciente acumula 2+ ausencias,
por lo que no debería ocupar franjas prime time (regla de negocio de la clínica).

### 5.2 Modificador de escaneo 3D

Heurística pedida: si **alguna** fase del tipo de tratamiento tiene `name` que
contiene (case-insensitive) `"3d"` o `"escaneo"`, mostrar en la fase activa el
indicador `+15 min (escaneo 3D)`.

```ts
const has3D = phases.some(p => /3d|escaneo/i.test(p.name));
if (has3D && phase.state === "active") → <span>+15 min (escaneo 3D)</span>
```

> Nota: es un **indicador informativo** derivado del nombre de la fase, no una
> modificación real de `duration_minutes` ni un write. La fuente de verdad de la
> duración sigue siendo la BD.

---

## 6. UI — Sheet lateral

### 6.1 Componente base `components/ui/sheet.tsx`

shadcn/ui Sheet se construye sobre `@radix-ui/react-dialog` (Drawer/Dialog con
`side`). **Dependencia nueva a agregar:** `@radix-ui/react-dialog`.

Se crea `components/ui/sheet.tsx` con el patrón estándar de shadcn (variantes de
lado, overlay, animaciones vía `tailwindcss-animate` ya instalado). Lado derecho
(`side="right"`), ancho `sm:max-w-md`. Estética nórdica existente: slate, bordes
tenues, tipografía sobria.

Exports: `Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle,
SheetDescription, SheetClose`.

### 6.2 Estructura visual del `AppointmentSheet`

```
┌─────────────────────────────────────────┐
│ Juan Pérez                  [Rest. prime] │  ← cabecera + badge alerta
│ Mié 18 jun · 15:00–16:00 · 60 min         │
│ ☎ +54 9 11 ...                            │
├─────────────────────────────────────────┤
│ FASES DEL TRATAMIENTO   (Ortodoncia)      │
│                                           │
│ ● Diagnóstico            ✓ completada     │  ← timeline vertical
│ │  clinical · 30 min                      │
│ ●  Escaneo 3D            ⏵ en curso       │
│ │  clinical · 45 min   +15 min (escaneo)  │
│ ○  Colocación            🔒 bloqueada      │
│ │  clinical · 60 min                      │
│ │  Disponible desde 25 jun                │
│ ○  Control               pendiente        │
│    lab_wait · cooldown 7 d                 │
├─────────────────────────────────────────┤
│ HISTORIAL                                 │
│ 18 jun · Escaneo 3D · confirmado          │
│ 04 jun · Diagnóstico · completado         │
│ ...                                       │
└─────────────────────────────────────────┘
```

### 6.3 Timeline de fases

Lista vertical con una columna de "riel" (línea + nodo de estado). Iconos
(`lucide-react`, ya instalado):

| Estado | Icono | Color |
|---|---|---|
| completada | `Check` / `CheckCircle2` | `text-slate-400` |
| activa | `PlayCircle` | `text-slate-900` (énfasis) |
| bloqueada | `Lock` | `text-amber-600` |
| pendiente | `Circle` | `text-slate-300` |

Cada item muestra: nombre, `phase_kind`, `duration_minutes` (o `cooldown N d` si
`lab_wait`), y para bloqueadas la línea "Disponible desde {fecha}".

### 6.4 Estados de carga / vacío / error

- **Cargando:** skeleton simple (líneas slate-100 con `animate-pulse`).
- **Sin tratamiento (treatmentTypeId null):** "Este turno no está asociado a un tratamiento."
- **Error de fetch:** "No se pudo cargar el detalle del turno." + botón reintentar.

---

## 7. Integración con `/calendar`

### 7.1 Problema: page.tsx es Server Component

`page.tsx` resuelve auth (`assertDoctorRole`), el `professional_id` server-side y
trae los datos. No puede tener `useState`. Para hacer las cards clickeables con un
**único ID seleccionado** (como pide el spec), se extrae la grilla a un Client
Component.

### 7.2 Decisión: `CalendarGrid.tsx` (client)

- **`page.tsx` (Server Component):** mantiene guard de rol, fetch de
  `getWeeklyAppointments(displayedMonday)`, navegación semanal (`<Link>`) y las
  tarjetas-resumen del día. El `clinic_id`/`professional_id` se resuelven acá,
  server-side, y **nunca** se pasan al cliente. Pasa a `<CalendarGrid>` solo datos
  serializables ya filtrados (las `WeeklyAppointment[]` + los días de la semana
  como ISO strings).
- **`CalendarGrid.tsx` (`"use client"`):** recibe `weekDays: string[]` y
  `appointments: WeeklyAppointment[]`. Renderiza la grilla (slots × días),
  mantiene `const [selectedId, setSelectedId] = useState<string | null>(null)`,
  y renderiza **una** instancia de `<Sheet open={!!selectedId}>` con
  `<AppointmentSheet appointmentId={selectedId} />`. Cada card es un `<button>`
  que hace `setSelectedId(a.id)`.

Los helpers de fecha/slot puros (`SLOTS`, `appointmentsForSlot`, `formatTime`,
`formatDuration`, `isToday`, etc.) se mueven a un módulo compartido
`calendar/grid-utils.ts` y se importan tanto desde `page.tsx` (resumen) como desde
`CalendarGrid.tsx`. No contienen secretos — son aritmética de fechas.

> **Alternativa descartada:** un `<Sheet>` por card (estado local por card). Es más
> simple pero contradice el "useState para el ID seleccionado" del spec y crea N
> instancias del Sheet. La opción elegida tiene un solo Sheet y menos DOM.

### 7.3 Card clickeable

La card actual (`<div>`) pasa a `<button type="button" onClick={...}>` con los
mismos estilos + `hover:bg-slate-50` y `focus-visible:ring`. Accesible por teclado.

---

## 8. Archivos a crear / modificar

| Archivo | Operación | Descripción |
|---|---|---|
| `frontend/package.json` | Modificar | + dependencia `@radix-ui/react-dialog` |
| `frontend/components/ui/sheet.tsx` | Crear | Componente Sheet (shadcn, side=right) |
| `frontend/components/ui/badge.tsx` | Crear | Badge (variantes default/destructive) para alertas |
| `frontend/app/(dashboard)/calendar/grid-utils.ts` | Crear | Helpers puros de fecha/slot (movidos desde page.tsx) |
| `frontend/app/(dashboard)/calendar/CalendarGrid.tsx` | Crear | Client: grilla + estado `selectedId` + Sheet |
| `frontend/app/(dashboard)/calendar/AppointmentSheet.tsx` | Crear | Client: fetch + cálculo de fases + UI del detalle |
| `frontend/app/(dashboard)/calendar/page.tsx` | Modificar | Delegar grilla a `<CalendarGrid>`; conservar guard/resumen/nav |

---

## 9. Restricciones y decisiones de diseño

| Restricción | Decisión |
|---|---|
| Sin endpoint nuevo en NestJS | Toda la lógica de fases se calcula en el cliente desde los datos traídos |
| `clinic_id` nunca como parámetro | Resuelto desde el JWT; RLS (`tenant_all`) filtra todas las queries del browser client |
| `professional_id` nunca en URL | Sigue resuelto server-side en `page.tsx` |
| Estado de fases en el cliente | Función pura `computePhaseViews(appt, phases, history)` testeable |
| Un solo Sheet | `useState<string|null>` en `CalendarGrid`, no un Sheet por card |
| Modificador 3D es informativo | Derivado del nombre de fase; no modifica `duration_minutes` ni escribe |
| Build limpio | `npm run build` sin errores ni warnings de tipos antes del PR |

---

## 10. Secuencia de implementación

1. `npm i @radix-ui/react-dialog` en `frontend/`
2. Crear `components/ui/sheet.tsx` y `components/ui/badge.tsx`
3. Extraer helpers puros a `calendar/grid-utils.ts`
4. Crear `calendar/AppointmentSheet.tsx` (fetch + `computePhaseViews` + UI)
5. Crear `calendar/CalendarGrid.tsx` (grilla client + `selectedId` + Sheet)
6. Refactor `page.tsx` para delegar en `<CalendarGrid>`
7. `npm run build` limpio
8. Commit + push a `claude/nifty-noether-v4ttsi` + abrir PR contra `main`
