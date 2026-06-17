# Fase 13 — Features Clínicas Finales

**Rama:** `claude/nifty-noether-v4ttsi`  
**PR:** único contra `main`

---

## Verificaciones previas (resultados)

| Campo | Resultado |
|---|---|
| `professionals.license_number` | **Existe** como `String?` — implementable directo, sin migration |
| Campo booleano 3D en `treatment_phase_templates` | **No existe** — solo `name`, `phase_kind`, `duration_minutes`, `cooldown_days`. La detección 3D es siempre `/3d\|escaneo/i` sobre el nombre |
| `@radix-ui/react-tabs` | **No instalado** — tabs implementadas con button + useState, sin nueva librería |
| RLS `clinical_notes` | `auth_role() in ('admin','doctor')` — reception excluida por RLS |
| RLS `treatment_types`, `treatment_phase_templates` | `tenant_all` (cualquier rol autenticado) — restricción de admin aplicada en Server Action |
| RLS `clinics` | `tenant_self` (cualquier rol autenticado) — restricción de admin en Server Action |

---

## 1. Historia clínica en /patients/[id]

### 1.1 `server.ts` — nuevas funciones

```ts
export interface ClinicalNote {
  id: string;
  note_type: string;
  body: string;
  created_at: string;
  author_name: string | null;
  treatment_name: string | null;
}

export async function getClinicalNotes(patientId: string): Promise<ClinicalNote[]>
// SELECT id, note_type, body, created_at,
//        professionals ( staff_members ( full_name ) ),
//        treatments ( treatment_types ( name ) )
// WHERE patient_id = ? AND deleted_at IS NULL
// ORDER BY created_at DESC

export interface PatientTreatment {
  id: string;
  name: string;  // treatment_types.name
  status: string;
}

export async function getPatientTreatments(patientId: string): Promise<PatientTreatment[]>
// SELECT id, status, treatment_types ( name )
// WHERE patient_id = ? AND deleted_at IS NULL
```

### 1.2 Server Action `patients/actions.ts`

```ts
"use server"
export async function createClinicalNote(formData: FormData): Promise<{error?: string}>
```

Pasos del Server Action:
1. `getUser()` → `user.id`
2. JOIN: `professionals ← staff_members WHERE auth_user_id = user.id` → `author_id`
3. Si no hay fila en `professionals` → `return { error: "Solo profesionales pueden crear notas clínicas." }`
4. Extrae `patient_id`, `note_type`, `body`, `treatment_id` (nullable) del FormData
5. INSERT en `clinical_notes` con `author_id` resuelto server-side, nunca del form
6. `revalidatePath("/patients/[id]")` usando el `patient_id`

### 1.3 `PatientTabs.tsx` (client)

Tabs simples: dos botones de estado + contenido condicional. Props:
```ts
{
  patientId: string;
  appointments: PatientAppointment[];
  notes: ClinicalNote[];
  treatments: PatientTreatment[];
}
```

**Tab "Turnos":** tabla existente de appointments.

**Tab "Historia clínica":**
- Lista de notas (fecha, badge de `note_type`, autor, tratamiento si existe, body)
- Botón "Nueva nota" → formulario inline (un `useState<boolean>`)
- Formulario: `note_type` (select nativo), `treatment_id` (select nativo, optional), `body` (textarea), botón Guardar con `useTransition` + toast

**Badge de note_type** — colores:
```
consulta    → variant="outline"
evolución   → variant="secondary"
diagnóstico → variant="default"
observación → variant="outline"
```

### 1.4 `/patients/[id]/page.tsx`

Agrega `getClinicalNotes` y `getPatientTreatments` al `Promise.all` del Server Component. Pasa datos a `<PatientTabs>`.

---

## 2. /settings — Configuración admin

### 2.1 Guard de rol

Solo `role === 'admin'`. Verificado en `page.tsx` y en cada Server Action.

### 2.2 Nav `layout.tsx`

Lógica actual: doctor ve "Calendario"; otros ven "Aprobaciones" + "Pacientes" + "Equipo".

Nuevo: dentro del bloque `!doctor`, mostrar "Ajustes" solo si `role === 'admin'`:
```tsx
{role === 'admin' && <Link href="/settings">Ajustes</Link>}
```

Requiere que `layout.tsx` pase `role` al JSX (ya lo obtiene de `getSessionAuth()`).

### 2.3 `server.ts` — nuevas funciones

```ts
export interface ClinicSettings {
  id: string;
  name: string;
  timezone: string;
  prime_time_start: string;  // "HH:MM:SS"
  prime_time_end: string;
  currency: string;
  valuation_fee: string | null;  // Decimal → string
}

export async function getClinicSettings(): Promise<ClinicSettings | null>
// SELECT id, name, timezone, prime_time_start, prime_time_end, currency, valuation_fee
// WHERE id = auth_clinic_id() (RLS tenant_self lo garantiza)

export interface TreatmentTypeWithPhases {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  phase_count: number;
  phases: {
    id: string;
    sequence_order: number;
    name: string;
    phase_kind: "clinical" | "lab_wait";
    duration_minutes: number | null;
    cooldown_days: number;
  }[];
}

export async function getTreatmentTypesWithPhases(): Promise<TreatmentTypeWithPhases[]>
// SELECT id, name, description, is_active,
//        treatment_phase_templates ( id, sequence_order, name, phase_kind, duration_minutes, cooldown_days )
// WHERE deleted_at IS NULL ORDER BY name ASC
```

### 2.4 `settings/actions.ts` — Server Actions

```ts
"use server"

// Guard: si auth_role() !== 'admin' → error inmediato

export async function updateClinicSettings(formData: FormData): Promise<{error?: string}>
// UPDATE clinics SET name, timezone, prime_time_start, prime_time_end, currency, valuation_fee
// WHERE id = clinic_id del JWT (no viene del form)
// revalidatePath("/settings")

export async function upsertTreatmentType(formData: FormData): Promise<{error?: string}>
// Si id existe → UPDATE treatment_types SET name, description
// Si no → INSERT treatment_types
// Luego: DELETE todas las fases del tipo + INSERT las nuevas del form
// (mismo patrón delete-rebuild que professional_availability)
// revalidatePath("/settings")
```

### 2.5 `settings/page.tsx`

Server Component. Guard: `role !== 'admin'` → redirect `/approvals`.

Layout: dos secciones (`<section>`) con separador visual.

**Sección A — Tipos de tratamiento:**
- Texto explicativo: "Los tipos de tratamiento parametrizan las fases del motor de scheduling. Cada fase define duración, tipo (clínica / laboratorio) y días de espera (cooldown) antes de agendar la fase siguiente."
- Tabla con `TreatmentTypeWithPhases[]`: columnas Nombre, Descripción, Fases, Estado
- Botón "+ Nuevo tipo" → `<TreatmentTypeSheet mode="create">`
- Click en fila → `<TreatmentTypeSheet mode="edit" type={row}>`

**Sección B — Configuración de la clínica:**
- `<ClinicSettingsForm settings={clinicSettings} />`

### 2.6 `TreatmentTypeSheet.tsx` (client)

Sheet de edición con:

**Datos del tipo:**
- `name` (text input)
- `description` (textarea optional)

**Editor de fases** (lista dinámica con `useState<PhaseInput[]>`):
- Botón "Agregar fase" → append al array
- Por fase: `name` (text), `phase_kind` (select: clinical | lab_wait), `duration_minutes` (number), `cooldown_days` (number), checkbox "Incluye escaneo digital 3D"
- El checkbox es UX helper: si está marcado, el `name` se envía con " (Escaneo 3D)" al final (si no lo tiene ya). La detección en runtime es siempre por regex — este campo no persiste en la BD de forma separada.
- Si checkbox marcado: badge `+15 min automático` junto a `duration_minutes`
- Botón × para eliminar una fase de la lista
- Fases reordenables visualmente (mover arriba/abajo con botones ↑ ↓, actualiza `sequence_order`)

Al guardar: `formData` con `name`, `description`, `id?`, y las fases serializadas como campos indexados (`phase_name_0`, `phase_kind_0`, `phase_duration_0`, `phase_cooldown_0`, `phase_3d_0`, etc.).

### 2.7 `ClinicSettingsForm.tsx` (client)

Formulario con `useTransition` + toast. Campos:
- `name` (text)
- `timezone` (text, default Argentina)
- `prime_time_start` / `prime_time_end` (input type="time") + texto explicativo
- `currency` (text)
- `valuation_fee` (number, decimal) + texto explicativo

---

## 3. license_number en StaffSheet

`professionals.license_number` existe. Cambios:

**`StaffSheet.tsx`:** agregar campo de texto `license_number` (visible solo si `currentRole === 'doctor'`).

**`staff/actions.ts` — `upsertStaff`:** en el bloque de professionals, agregar `license_number` al upsert:
```ts
const { data: sm } = await supabase
  .from("staff_members")
  .select("id, clinic_id")  // agregar clinic_id
  .eq("id", id)
  .single();

// upsert professionals con clinic_id + license_number
await supabase.from("professionals").upsert(
  { staff_member_id: id, clinic_id: sm.clinic_id, license_number: licenseNumber || null },
  { onConflict: "staff_member_id" }
);
```

---

## 4. Checkbox 3D en fases (visual)

Implementado dentro de `TreatmentTypeSheet.tsx` (ítem 2.6 arriba). No persiste un campo booleano — modifica el nombre de la fase con sufijo "(Escaneo 3D)". La detección en AppointmentSheet sigue siendo `/3d|escaneo/i.test(name)`.

---

## Archivos a crear / modificar

### Crear
| Archivo | Descripción |
|---|---|
| `docs/fase13_features_clinicas_blueprint.md` | Este archivo |
| `frontend/app/(dashboard)/patients/actions.ts` | Server Action: createClinicalNote |
| `frontend/app/(dashboard)/patients/PatientTabs.tsx` | Client: tabs Turnos + Historia clínica + form nueva nota |
| `frontend/app/(dashboard)/settings/page.tsx` | Server: settings, guard admin |
| `frontend/app/(dashboard)/settings/actions.ts` | Server Actions: updateClinicSettings, upsertTreatmentType |
| `frontend/app/(dashboard)/settings/TreatmentTypeSheet.tsx` | Client: Sheet edición tipos de tratamiento + fases |
| `frontend/app/(dashboard)/settings/ClinicSettingsForm.tsx` | Client: form ajustes de clínica |

### Modificar
| Archivo | Cambio |
|---|---|
| `frontend/lib/supabase/server.ts` | + getClinicalNotes, getPatientTreatments, getClinicSettings, getTreatmentTypesWithPhases |
| `frontend/app/(dashboard)/patients/[id]/page.tsx` | Usar PatientTabs, pasar notes y treatments |
| `frontend/app/(dashboard)/staff/StaffSheet.tsx` | + campo license_number para doctores |
| `frontend/app/(dashboard)/staff/actions.ts` | upsertStaff: agregar clinic_id y license_number al upsert de professionals |
| `frontend/app/(dashboard)/layout.tsx` | + link "Ajustes" visible solo para admin |

---

## Secuencia de implementación

1. `server.ts`: 4 funciones nuevas
2. `patients/actions.ts`: `createClinicalNote`
3. `patients/PatientTabs.tsx`: tabs + nota form
4. `patients/[id]/page.tsx`: integrar PatientTabs
5. `staff/StaffSheet.tsx`: campo license_number
6. `staff/actions.ts`: agregar clinic_id + license_number al upsert de professionals
7. `settings/actions.ts`: `updateClinicSettings` + `upsertTreatmentType`
8. `settings/TreatmentTypeSheet.tsx`
9. `settings/ClinicSettingsForm.tsx`
10. `settings/page.tsx`
11. `layout.tsx`: link Ajustes
12. `npm run build` limpio
13. Commit + push + PR
