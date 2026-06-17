# Fase 12 — Cierre del Frontend

**Rama:** `claude/nifty-noether-v4ttsi`  
**PR:** único contra `main`  
**Acceso:** según rol existente en cada página

---

## 1. Contexto

Cierre de todas las vistas del frontend en un solo PR. Las 6 áreas son:
edición de staff, historial de turnos en /patients/[id], enrichment del Sheet
de calendario, enrichment de /approvals, toasts globales y limpieza de archivos
legacy.

---

## 2. Decisiones arquitectónicas

| Decisión | Fundamento |
|---|---|
| Writes de staff y cancelación → Server Actions directas a Supabase | El user lo especifica explícitamente; distinto del confirm que sigue en NestJS |
| `auth_user_id` al crear staff → UUID placeholder server-side | La columna es `NOT NULL UNIQUE` en la BD; no hay migration; se genera con `crypto.randomUUID()` como placeholder hasta que el admin vincule un auth user |
| Email en AppointmentSheet → omitir | `patients` no tiene columna `email` en el schema; agregar sería una migration fuera de scope |
| Toaster (sonner) → en `app/layout.tsx` | Única instancia global; fuera del dashboard layout para que también cubra /login si fuera necesario |
| professional_availability al guardar → DELETE + INSERT | Más simple que upsert individual; el Server Action borra todas las filas activas del profesional y reinserta las del formulario |

---

## 3. Archivos a crear / modificar / eliminar

### Crear
| Archivo | Descripción |
|---|---|
| `docs/fase12_frontend_cierre_blueprint.md` | Este archivo |
| `frontend/app/(dashboard)/staff/StaffSheet.tsx` | Client: Sheet de edición/creación de staff + disponibilidad |
| `frontend/app/(dashboard)/staff/StaffTable.tsx` | Client: tabla clickeable con selectedId + Sheet |
| `frontend/app/(dashboard)/staff/actions.ts` | Server Actions: upsertStaff, deactivateStaff |
| `frontend/app/(dashboard)/calendar/actions.ts` | Server Action: cancelAppointment |

### Modificar
| Archivo | Cambio |
|---|---|
| `frontend/app/(dashboard)/staff/page.tsx` | Delegar tabla en StaffTable; agregar botón "Nuevo miembro" |
| `frontend/app/(dashboard)/patients/[id]/page.tsx` | Agregar sección historial de turnos |
| `frontend/app/(dashboard)/calendar/AppointmentSheet.tsx` | DNI, "Cancelar turno", "Próxima fase disponible" |
| `frontend/app/(dashboard)/approvals/ApprovalsTable.tsx` | Columnas DNI, teléfono ya existe, fase |
| `frontend/lib/supabase/server.ts` | `getAppointmentsByPatient`, update `getProposedAppointments` |
| `frontend/app/layout.tsx` | Agregar `<Toaster />` de sonner |
| `frontend/package.json` | + `sonner` |

### Eliminar
- `frontend/app/(dashboard)/approvals/confirm-button.tsx`
- `frontend/app/(dashboard)/approvals/refresh-button.tsx`
- `frontend/app/(dashboard)/calendar/refresh-button.tsx`
- `frontend/app/(dashboard)/patients/refresh-button.tsx`

---

## 4. Detalle por ítem

### 4.1 /staff — edición completa

**`StaffTable.tsx`** (client): tabla con filas clickeables, `useState<StaffMember | null>` para el seleccionado, `useState<boolean>` para modo creación. Botón "Nuevo miembro" en el header.

**`StaffSheet.tsx`** (client): Sheet side=right con dos modos:
- `mode="edit"` → formulario precargado con datos del miembro
- `mode="create"` → formulario vacío

Campos del formulario:
```
full_name     — text input
role          — select: admin | doctor | reception
is_active     — checkbox (solo en modo edit)
```

Sección "Disponibilidad" (solo si role === "doctor"):
```
Checkbox Lun + time inputs (start_time, end_time)
Checkbox Mar + time inputs
...hasta Sáb (weekday 6)
```

**`actions.ts`**:

```ts
// Upsert staff member + professional (si doctor) + availability
export async function upsertStaff(formData: FormData): Promise<{error?: string}>

// Soft delete (is_active = false)
export async function deactivateStaff(memberId: string): Promise<{error?: string}>
```

`upsertStaff` server-side:
1. Extrae campos del FormData
2. Si es creación (`id` ausente): genera `auth_user_id = crypto.randomUUID()` como placeholder
3. UPSERT en `staff_members` (ON CONFLICT id DO UPDATE)
4. Si role === "doctor": UPSERT en `professionals` (ON CONFLICT staff_member_id DO UPDATE)
5. Si role === "doctor" y hay días seleccionados: DELETE de `professional_availability` WHERE professional_id = ? luego INSERT de los nuevos días
6. `revalidatePath("/staff")`

RLS: el Server Action usa `createClient()` con las cookies del usuario logueado. Para poder escribir, el usuario debe tener policy de INSERT/UPDATE para su `clinic_id`. Si RLS no lo permite, se muestra error de permisos.

**Nota de seguridad:** `clinic_id` nunca viene del form — se extrae del JWT server-side:
```ts
const { role: userRole } = await getSessionAuth();
// clinic_id from JWT via getSessionAuth / session.access_token
```
En la práctica, RLS filtra automáticamente por clinic_id del JWT para las policies existentes. No hace falta pasarlo explícitamente.

---

### 4.2 /patients/[id] — historial de turnos

**`getAppointmentsByPatient(patientId)`** en `server.ts`:

```ts
export interface PatientAppointment {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  professional_name: string | null;
  treatment_label: string | null;  // treatment_types.name ?? phase_template.name
}

export async function getAppointmentsByPatient(patientId: string): Promise<PatientAppointment[]>
```

Query:
```ts
supabase
  .from("appointments")
  .select(`
    id, start_at, end_at, status,
    professionals ( staff_members ( full_name ) ),
    treatments ( treatment_types ( name ) ),
    treatment_phase_templates ( name )
  `)
  .eq("patient_id", patientId)
  .is("deleted_at", null)
  .order("start_at", { ascending: false })
```

**`patients/[id]/page.tsx`**: reemplaza el placeholder "Historial de turnos próximamente" con la tabla real. Columnas: Fecha/hora, Profesional, Tratamiento/Fase, Estado (Badge).

Badge de estado con colores:
```
confirmed   → variant="outline"  (slate)
completed   → variant="secondary" (gris)
proposed    → variant="outline"   (slate)
cancelled   → variant="outline" + text-slate-400
no_show     → variant="destructive"
in_progress → variant="default"  (oscuro)
```

---

### 4.3 /calendar — AppointmentSheet enrichment

**Cambios en la query A** (fetch del turno):
```ts
patients ( id, full_name, phone, national_id )
```

**Cabecera del Sheet**:
- Agregar línea con DNI: `DNI {patient.national_id}` si existe

**Botón "Cancelar turno"** (solo si `status !== 'cancelled'`):
- Llama Server Action `cancelAppointment(appointmentId)` en `calendar/actions.ts`
- El botón muestra spinner mientras procesa
- En éxito: `revalidatePath("/calendar")` + cierra Sheet (setState idle)
- En error: toast de error

**`calendar/actions.ts`**:
```ts
export async function cancelAppointment(id: string): Promise<{error?: string}>
// UPDATE appointments SET status = 'cancelled' WHERE id = ? AND status != 'cancelled'
// revalidatePath("/calendar")
```

**Sección "Próxima fase disponible"** (nuevo, bajo el historial):
Solo visible si la fase activa tiene `cooldown_days > 0`:
```
Próxima fase disponible
─────────────────────────────
[nombre de la fase siguiente]
Disponible desde: {start_at del turno actual + cooldown_days}
```
Si la fase activa es la última → no mostrar esta sección.

---

### 4.4 /approvals — enriquecer tabla

**`getProposedAppointments`** actualizada: agregar `national_id` al select de patients y `treatment_phase_templates ( name )` al select raíz.

```ts
patients ( full_name, phone, national_id ),
treatment_phase_templates ( name )
```

Actualizar `Appointment` type local (o crear `ProposedAppointmentRow` extendido) para incluir `national_id` y `phase_name`.

**`ApprovalsTable.tsx`**: agregar columnas:
- DNI: `appt.patient?.national_id ?? "—"`  
- Teléfono: ya existe como sub-row bajo Paciente, moverlo a columna propia
- Fase: `appt.phase_name ?? appt.treatment_type ?? "—"`

Tabla actualizada:
```
| Paciente | DNI | Teléfono | Profesional | Fase/Tratamiento | Fecha/hora | Acción |
```

---

### 4.5 Toasts con sonner

**Instalación**: `npm install sonner` (única lib nueva permitida).

**`app/layout.tsx`**: agregar `<Toaster position="bottom-right" richColors />` del package `sonner`.

**Uso en Server Actions** → los toasts son client-side. El patrón: las Server Actions devuelven `{ error?: string; success?: string }`. Los Client Components que las llaman usan `toast.error(result.error)` o `toast.success(result.success)`.

Actions que muestran toast:
- `confirmAppointment` → ya existente, agregar toast
- `cancelAppointment` → nueva
- `upsertStaff` → nueva
- `deactivateStaff` → nueva

**Spinner** en botones de acción: `isPending` de `useTransition` ya está en `ConfirmRow`. Extender a los nuevos botones con el mismo patrón.

---

## 5. Secuencia de implementación

1. `npm install sonner` + agregar Toaster al root layout
2. `server.ts`: agregar `getAppointmentsByPatient` + actualizar `getProposedAppointments` (national_id + phase)
3. `calendar/actions.ts`: `cancelAppointment`
4. `staff/actions.ts`: `upsertStaff` + `deactivateStaff`
5. `staff/StaffSheet.tsx` + `staff/StaffTable.tsx`
6. `staff/page.tsx`: delegar en StaffTable
7. `patients/[id]/page.tsx`: agregar historial
8. `calendar/AppointmentSheet.tsx`: DNI + cancelar + próxima fase
9. `approvals/ApprovalsTable.tsx`: columnas nuevas + toasts
10. Eliminar archivos legacy
11. `npm run build` limpio
12. Commit + push + PR
