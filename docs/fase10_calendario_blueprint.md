# Fase 10 — Vista de Calendario Semanal del Doctor

**Rama de implementación:** `claude/phase-10-calendar`  
**PR:** contra `main`  
**Acceso:** solo rol `doctor`

---

## 1. Contexto

El rol `doctor` actualmente queda redirigido a `/patients` por el layout guard. Esta fase agrega `/calendar` como su vista propia: una grilla semanal de turnos confirmados, filtrada por el profesional logueado sin exponer nunca el `professional_id` como parámetro.

---

## 2. Cambios de acceso y navegación

### `frontend/app/(dashboard)/layout.tsx`

**Guard de rol** (línea 43): cambiar redirect de `/patients` a `/calendar`.

```ts
if (role === "doctor" || role === "professional") {
  redirect("/calendar");  // era /patients
}
```

**Nav**: agregar link "Calendario" (solo visible para el doctor). El layout es compartido por todos los roles, pero el doctor nunca llega a ver Aprobaciones/Pacientes porque es redirigido antes. El link de Calendario puede estar en el nav general — no hay riesgo de acceso porque la page `/calendar` hace su propio guard interno.

```tsx
<Link href="/calendar" className="text-sm text-muted-foreground hover:text-foreground">
  Calendario
</Link>
```

---

## 3. Capa de datos

### 3.1 Resolución de `professional_id` desde el JWT

El `sub` del JWT es el `auth_user_id`. La cadena de resolución server-side:

```
supabase.auth.getUser() → user.id (= auth_user_id)
  → staff_members WHERE auth_user_id = user.id → staff_members.id
  → professionals WHERE staff_member_id = staff_members.id → professionals.id
```

Se puede hacer en una sola query PostgREST con join interno:

```ts
const { data: prof } = await supabase
  .from("professionals")
  .select("id, staff_members!inner(auth_user_id)")
  .eq("staff_members.auth_user_id", user.id)
  .single();
```

Si `prof` es null → el doctor no tiene fila en `professionals` → mostrar estado vacío con mensaje de configuración, no lanzar error.

### 3.2 Cálculo de la semana actual

Semana = lunes 00:00:00 a domingo 23:59:59.999 en `America/Argentina/Buenos_Aires` (UTC-3, sin horario de verano).

```ts
function getWeekBounds(): { weekStart: Date; weekEnd: Date } {
  const now = new Date();
  const day = now.getDay(); // 0=dom … 6=sáb
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { weekStart: monday, weekEnd: sunday };
}
```

### 3.3 Query de turnos

```ts
const { data, error } = await supabase
  .from("appointments")
  .select(`
    id, start_at, end_at,
    patients ( full_name ),
    treatments ( treatment_types ( name ) ),
    treatment_phase_templates ( name )
  `)
  .eq("professional_id", prof.id)
  .eq("status", "confirmed")
  .gte("start_at", weekStart.toISOString())
  .lte("start_at", weekEnd.toISOString())
  .order("start_at", { ascending: true });
```

RLS (`tenant_all`) filtra por `clinic_id` del JWT — no hace falta filtrar explícitamente.

### 3.4 Nueva función en `server.ts`

```ts
export async function getWeeklyAppointments(): Promise<WeeklyAppointment[]>
```

Devuelve `WeeklyAppointment[]` (tipo local, no en `@clinica/shared` — es específico de esta vista):

```ts
interface WeeklyAppointment {
  id: string;
  start_at: string;   // ISO 8601
  end_at: string;
  patient_name: string;
  treatment_label: string | null;  // treatment_types.name ?? phase_template.name ?? null
}
```

La función resuelve también el `professional_id` internamente y lanza `redirect("/login")` si no hay sesión. Si no hay fila en `professionals`, devuelve `[]`.

---

## 4. UI — Grilla semanal

### 4.1 Estructura

Server Component puro (`export const dynamic = "force-dynamic"`). Sin Client Components salvo un botón de actualización (`router.refresh()`).

Layout:

```
┌─────────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐
│  Hora   │ Lun │ Mar │ Mié │ Jue │ Vie │ Sáb │ Dom │
├─────────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤
│ 09:00   │     │ ■   │     │     │     │     │     │
│ 10:00   │     │     │ ■   │     │     │     │     │
│  ...    │     │     │     │     │     │     │     │
│ 19:00   │     │     │     │ ■   │     │     │     │
└─────────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘
```

Franjas horarias: **09:00 a 19:00** (11 franjas de 1 hora; turnos que empiezan a las 19:x quedan en la última franja).

### 4.2 Implementación de la grilla

CSS Grid con 8 columnas (1 hora + 7 días). Sin librerías externas de calendario.

```tsx
<div className="grid grid-cols-[4rem_repeat(7,1fr)] border-l border-t">
  {/* Header row */}
  <div /> {/* corner vacío */}
  {DAYS.map(d => <DayHeader key={d} label={d} date={...} />)}

  {/* Hour rows */}
  {HOURS.map(hour => (
    <>
      <HourLabel hour={hour} />
      {weekDays.map(day => (
        <HourCell key={day.iso} appointments={appointmentsFor(day, hour)} />
      ))}
    </>
  ))}
</div>
```

`HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]`  
`DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]`

### 4.3 Card de turno

Dentro de cada celda, por cada appointment que empiece en esa hora/día:

```tsx
<div className="rounded-md bg-slate-100 border border-slate-200 p-2 text-xs space-y-0.5">
  <p className="font-medium text-slate-800 truncate">{patient_name}</p>
  <p className="text-slate-500 truncate">{treatment_label ?? "—"}</p>
  <p className="text-slate-400">{startTime} – {endTime}</p>
</div>
```

### 4.4 Estado vacío / sin turnos en la semana

Celda vacía = sin background, borde tenue. No hay texto "sin turnos" por celda — el silencio visual es el estado vacío.

### 4.5 Sin turnos configurados (professional_id no encontrado)

```tsx
<div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
  Tu perfil de profesional aún no está configurado. Contactá al administrador.
</div>
```

---

## 5. Archivos a crear / modificar

| Archivo | Operación | Descripción |
|---|---|---|
| `frontend/app/(dashboard)/layout.tsx` | Modificar | Redirect doctor a `/calendar`; agregar link "Calendario" al nav |
| `frontend/lib/supabase/server.ts` | Modificar | Agregar `getWeeklyAppointments()` + tipo `WeeklyAppointment` |
| `frontend/app/(dashboard)/calendar/page.tsx` | Crear | Server Component con guard de rol doctor, grilla semanal |
| `frontend/app/(dashboard)/calendar/refresh-button.tsx` | Crear | Client Component con `router.refresh()` |

---

## 6. Restricciones y decisiones de diseño

| Restricción | Decisión |
|---|---|
| `professional_id` nunca en URL | Se resuelve server-side desde `user.id` (JWT sub) |
| Sin parámetro `?week=` por ahora | Semana = siempre la actual (iteración futura) |
| RLS filtra por `clinic_id` | No hace falta filtrar `clinic_id` en la query |
| Sin librerías de calendario | CSS Grid nativo |
| Server Component puro | Solo `RefreshButton` es Client Component |
| Rol `admin`/`reception` no accede a `/calendar` | Guard interno en `page.tsx`: si no es doctor → 404 o redirect a `/approvals` |

---

## 7. Secuencia de implementación

1. Agregar `getWeeklyAppointments()` a `server.ts`
2. Crear `calendar/page.tsx` con la grilla
3. Crear `calendar/refresh-button.tsx`
4. Modificar `layout.tsx` (redirect + nav)
5. `npm run build` sin errores
6. Commit + push + PR contra `main`
