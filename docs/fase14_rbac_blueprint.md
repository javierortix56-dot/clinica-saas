# Fase 14 — Control de acceso por rol (RBAC)

**Rama:** `claude/nifty-noether-v4ttsi`

---

## Paso 0 — Relevamiento

### `getSessionAuth()` — qué devuelve exactamente

```ts
// lib/supabase/server.ts líneas 31-54
async function getSessionAuth(): Promise<{ hasSession: boolean; role: string | null }>
```

- Llama a `supabase.auth.getSession()`.
- Si no hay sesión → `{ hasSession: false, role: null }`.
- Si hay sesión → decodifica manualmente el `access_token` (split `.`, base64) y lee el claim `user_role`.
- **Devuelve exactamente dos campos: `hasSession` y `role`.**
- No devuelve `full_name`, `email`, `user_id` ni ningún otro dato de usuario.
- Valores posibles de `role`: `"admin"`, `"doctor"`, `"reception"`, `null`.
- `isDoctorRole(role)` retorna `true` si `role === "doctor" || role === "professional"`.

---

### Guards existentes hoy

| Ruta | Guard actual | Comportamiento |
|---|---|---|
| `/approvals` | `isDoctorRole(role)` → redirect `/calendar` | Doctor no puede entrar |
| `/patients` | `isDoctorRole(role)` → redirect `/calendar` | Doctor no puede entrar |
| `/settings` | `role !== 'admin'` → redirect `/approvals` | Solo admin puede entrar |
| `/calendar` | Ninguno | Cualquier rol autenticado |
| `/patients/[id]` | Ninguno | Cualquier rol autenticado |
| `/staff` | Ninguno | Cualquier rol autenticado |
| Middleware global | Sin sesión → `/login`; sesión + `/login` → `/approvals` | Solo guard de sesión, sin lógica de rol |

**Conclusión:** los guards en `/approvals` y `/patients` bloquean al doctor, lo cual contradice la nueva matriz (todos los roles deben acceder a todas las rutas excepto `/settings`). Estos redirects deben eliminarse.

---

### Nav actual (`(dashboard)/layout.tsx`)

```
[Admin/Reception]  Aprobaciones | Pacientes | Equipo | Ajustes (solo admin)
[Doctor]           Calendario
```

- "Ajustes" ya es condicional: `role === 'admin'` ✅
- No hay nombre de usuario ni badge de rol — a agregar.
- El doctor no ve Aprobaciones, Pacientes ni Equipo — a cambiar según nueva matriz.

---

## Paso 1 — Blueprint

### Matriz de acceso por ruta

| Ruta | admin | doctor | reception | Guard actual → acción |
|---|---|---|---|---|
| `/approvals` | ✅ | ✅ | ✅ | Eliminar redirect al doctor |
| `/calendar` | ✅ | ✅ | ✅ | Sin cambios |
| `/patients` | ✅ | ✅ | ✅ | Eliminar redirect al doctor |
| `/patients/[id]` | ✅ | ✅ | ✅ | Sin cambios (sin guard) |
| `/staff` | ✅ | ✅ | ✅ | Sin cambios (sin guard) |
| `/settings` | ✅ | ❌ | ❌ | Agregar guard en middleware + mantener guard en page.tsx |

---

### Matriz de elementos UI por rol

| Elemento | admin | doctor | reception | Dónde vive la condición |
|---|---|---|---|---|
| Nav "Ajustes" | ✅ | ❌ | ❌ | `layout.tsx` (ya implementado) |
| Badge de rol en nav | gris oscuro | azul | verde | `layout.tsx` (a agregar) |
| Nombre usuario en nav | ✅ | ✅ | ✅ | `layout.tsx` (a agregar) |
| Botón "Nueva nota clínica" | ✅ | ✅ | ❌ | `PatientTabs.tsx` via prop `role` del page.tsx padre |
| Campo matrícula en StaffSheet | ✅ | ✅ | ✅* | `StaffSheet.tsx` — condición sobre rol del **miembro editado**, no del usuario logueado |

> *El campo matrícula se muestra cuando el miembro editado tiene `role === 'doctor'`. Un usuario reception editando un doctor vería el campo — esto es correcto: el campo es un atributo del miembro, no del viewer. La condición actual `currentRole === 'doctor'` ya usa el rol del miembro editado (inicializado desde `member?.role`), no el del usuario logueado. No requiere cambio.

---

### Estrategia de implementación por capa

#### Middleware (`frontend/lib/supabase/middleware.ts`)
- **Única regla de rol en middleware:** `/settings` → solo admin.
- El rol se lee desde el JWT claim `user_role` (ya en `app_metadata`).
- No se hace DB query en middleware (solo lectura del token ya verificado por `getUser()`).
- Todas las demás rutas del dashboard: cualquier rol autenticado. Sin lógica adicional.

#### Server Components (page.tsx)
- `/approvals/page.tsx`: eliminar el `isDoctorRole` redirect.
- `/patients/page.tsx`: eliminar el `isDoctorRole` redirect.
- `/settings/page.tsx`: mantener el guard `role !== 'admin'` (defensa en profundidad, aunque middleware ya lo bloquea).
- `/patients/[id]/page.tsx`: pasar `role` como prop a `<PatientTabs>`.

#### Client Components
- `PatientTabs.tsx`: recibe `role` como prop string, condiciona botón "Nueva nota".
- `StaffSheet.tsx`: sin cambios — `currentRole` ya es el rol del miembro editado.

#### Nav (`(dashboard)/layout.tsx`)
- Llamar `getSessionAuth()` (ya existe) + query a `staff_members` para `full_name`.
- Mostrar todos los links del nav para todos los roles (nueva matriz: todos acceden a todo excepto /settings).
- Añadir badge de rol con colores fijos: admin → slate-700, doctor → blue-600, reception → green-600.
- Mostrar nombre del usuario logueado a la derecha del nav.

---

### Cambios por archivo

| Archivo | Tipo de cambio |
|---|---|
| `frontend/lib/supabase/middleware.ts` | +guard de rol para `/settings` |
| `frontend/app/(dashboard)/layout.tsx` | +nombre usuario, +badge rol, +todos los links visibles a todos |
| `frontend/app/(dashboard)/approvals/page.tsx` | -redirect del doctor |
| `frontend/app/(dashboard)/patients/page.tsx` | -redirect del doctor |
| `frontend/app/(dashboard)/patients/[id]/page.tsx` | +prop `role` a `PatientTabs` |
| `frontend/app/(dashboard)/patients/PatientTabs.tsx` | +condición botón "Nueva nota" por prop `role` |
| `scripts/seed-test-users.sql` | nuevo — instrucciones de carga de usuarios de prueba |

**No se crean migraciones. No se instalan librerías. No se toca el Custom Access Token Hook.**

---

## Paso 2 — Detalles de implementación

### 2a — Middleware

```ts
// Después de getUser() y el guard de /login, agregar:
const userRole = (user?.app_metadata?.user_role as string | undefined) ?? null;

if (userRole !== "admin" && request.nextUrl.pathname.startsWith("/settings")) {
  const url = request.nextUrl.clone();
  url.pathname = "/approvals";
  return NextResponse.redirect(url);
}
```

### 2b — Nav layout.tsx

Para el nombre del usuario, query en layout.tsx:
```ts
const supabase = createClient();
const { data: sm } = await supabase
  .from("staff_members")
  .select("full_name")
  .eq("auth_user_id", user.id)   // user viene de getUser() ya existente
  .single();
const displayName = sm?.full_name ?? user.email ?? "Usuario";
```

Badge de rol:
```ts
const ROLE_COLORS = {
  admin: "bg-slate-700 text-white",
  doctor: "bg-blue-600 text-white",
  reception: "bg-green-600 text-white",
};
const ROLE_LABELS = { admin: "Admin", doctor: "Profesional", reception: "Recepción" };
```

Nav links — todos los roles ven los mismos links (menos /settings para no-admin):
```
Aprobaciones | Calendario | Pacientes | Equipo | [Ajustes — solo admin]
```

### 2c — PatientTabs

```tsx
// page.tsx pasa role
<PatientTabs ... role={role} />

// PatientTabs recibe
export function PatientTabs({ ..., role }: { ..., role: string | null }) {
  const canCreateNote = role === "admin" || role === "doctor";
  // ...
  {!showForm && canCreateNote && (
    <Button size="sm" onClick={() => setShowForm(true)}>+ Nueva nota</Button>
  )}
}
```

### 2d — StaffSheet (verificación)

`currentRole` se inicializa como `member?.role ?? "reception"` y se actualiza con el `onChange` del select de rol dentro del form — **es el rol del miembro editado, no del usuario logueado**. Correcto, sin cambio.

### 2e — Script SQL de usuarios de prueba

```sql
-- scripts/seed-test-users.sql
-- CÓMO EJECUTAR: desde Supabase Dashboard → SQL Editor → pegar y ejecutar
-- El hook de custom access token (migración 0007) asigna user_role desde staff_members.role

-- 1. Insertar en auth.users (vía Supabase Admin API o SQL Editor con permisos de service_role)
-- 2. Insertar en public.staff_members con el auth_user_id resultante
```
