-- =============================================================================
-- GESTIÓN DE USUARIOS — Clínica SaaS
-- =============================================================================
-- Este archivo contiene los comandos SQL para crear usuarios, asignarles roles
-- y gestionar permisos de dueño (is_owner) en la plataforma.
--
-- IMPORTANTE:
--   • Nunca commitees contraseñas reales en este archivo.
--   • Ejecutar siempre en Supabase SQL Editor (no se requiere service_role key).
--   • El JWT se refresca automáticamente al generar nuevo token — el usuario
--     debe cerrar sesión y volver a entrar para ver cambios de rol/is_owner.
-- =============================================================================


-- =============================================================================
-- SECCIÓN 1 — CREAR USUARIO DUEÑO (primer setup de la clínica)
-- =============================================================================
--
-- PASO A: Crear el usuario en Supabase Auth (UI o Admin API)
--
--   Opción 1 — Supabase Dashboard:
--     1. Ir a Authentication → Users → "Add user"
--     2. Ingresar email y contraseña → "Create user"
--     3. Copiar el UUID generado (columna "UID")
--
--   Opción 2 — Admin API (desde tu servidor con service_role key):
--     POST https://<project>.supabase.co/auth/v1/admin/users
--     Authorization: Bearer <SERVICE_ROLE_KEY>
--     Content-Type: application/json
--     {
--       "email": "dueno@tudominio.com",
--       "password": "ContraseñaSegura123!",
--       "email_confirm": true
--     }
--     → La respuesta incluye el UUID del usuario creado.
--
-- PASO B: Insertar en staff_members con is_owner = true
--
-- Reemplazá los valores entre < > antes de ejecutar:

DO $$
DECLARE
  v_auth_user_id  uuid := '<UUID_DEL_AUTH_USER>';        -- UUID de Supabase Auth
  v_clinic_id     uuid := '791f2ec3-f0b9-4a60-92fb-330ea52433aa'; -- ID de tu clínica
  v_full_name     text := 'Nombre Apellido';
  v_email         text := 'dueno@tudominio.com';
BEGIN
  INSERT INTO public.staff_members (
    auth_user_id,
    clinic_id,
    role,
    full_name,
    email,
    is_active,
    is_owner
  )
  VALUES (
    v_auth_user_id,
    v_clinic_id,
    'admin',        -- El dueño siempre tiene rol admin
    v_full_name,
    v_email,
    true,
    true            -- is_owner = true → acceso a Equipo, Ajustes e Integraciones
  )
  ON CONFLICT (auth_user_id) DO UPDATE SET
    is_owner  = true,
    is_active = true;

  RAISE NOTICE 'Usuario dueño creado/actualizado: %', v_email;
END $$;


-- =============================================================================
-- SECCIÓN 2 — CREAR USUARIO CON ROL (admin / doctor / reception)
-- =============================================================================
--
-- PASO A: Crear en Supabase Auth (igual que la Sección 1, Paso A).
-- PASO B: Insertar con el rol correspondiente.
--
-- Reemplazá los valores entre < > antes de ejecutar:

DO $$
DECLARE
  v_auth_user_id  uuid := '<UUID_DEL_AUTH_USER>';
  v_clinic_id     uuid := '791f2ec3-f0b9-4a60-92fb-330ea52433aa';
  v_full_name     text := 'Nombre Apellido';
  v_email         text := 'usuario@tudominio.com';
  -- Roles disponibles: 'admin' | 'doctor' | 'reception'
  v_role          text := 'reception';
BEGIN
  INSERT INTO public.staff_members (
    auth_user_id, clinic_id, role, full_name, email, is_active, is_owner
  )
  VALUES (
    v_auth_user_id, v_clinic_id, v_role, v_full_name, v_email, true, false
  )
  ON CONFLICT (auth_user_id) DO UPDATE SET
    role      = EXCLUDED.role,
    full_name = EXCLUDED.full_name,
    email     = EXCLUDED.email,
    is_active = true;

  -- Si el rol es doctor, crear fila en professionals (requerida para turnos).
  IF v_role = 'doctor' THEN
    INSERT INTO public.professionals (staff_member_id, clinic_id)
    SELECT id, clinic_id
    FROM public.staff_members
    WHERE auth_user_id = v_auth_user_id
    ON CONFLICT (staff_member_id) DO NOTHING;
  END IF;

  RAISE NOTICE 'Usuario creado/actualizado: % (rol: %)', v_email, v_role;
END $$;


-- =============================================================================
-- SECCIÓN 3 — CAMBIAR ROL DE UN USUARIO EXISTENTE
-- =============================================================================
-- Roles disponibles: 'admin' | 'doctor' | 'reception'
-- El usuario debe cerrar sesión y volver a entrar para que el JWT se actualice.

UPDATE public.staff_members
SET role = 'admin'          -- ← cambiar al rol deseado
WHERE email = 'usuario@tudominio.com'
  AND deleted_at IS NULL;

-- Si pasás a alguien a doctor, asegurate de que tenga fila en professionals:
INSERT INTO public.professionals (staff_member_id, clinic_id)
SELECT id, clinic_id
FROM public.staff_members
WHERE email = 'usuario@tudominio.com'
  AND deleted_at IS NULL
ON CONFLICT (staff_member_id) DO NOTHING;


-- =============================================================================
-- SECCIÓN 4 — OTORGAR / REVOCAR DUEÑO (is_owner)
-- =============================================================================
-- ADVERTENCIA: Siempre debe existir al menos un dueño activo.
-- La app valida esto antes de deactivar/eliminar, pero acá es tu responsabilidad.

-- Promover a dueño:
UPDATE public.staff_members
SET is_owner = true, role = 'admin'   -- el dueño debe ser admin
WHERE email = 'nuevo-dueno@tudominio.com'
  AND deleted_at IS NULL;

-- Revocar dueño (solo si hay otro dueño activo):
UPDATE public.staff_members
SET is_owner = false
WHERE email = 'ex-dueno@tudominio.com'
  AND deleted_at IS NULL;

-- Transferir dueño de A a B en una sola transacción:
BEGIN;
  UPDATE public.staff_members SET is_owner = true
  WHERE email = 'nuevo-dueno@tudominio.com' AND deleted_at IS NULL;

  UPDATE public.staff_members SET is_owner = false
  WHERE email = 'dueno-anterior@tudominio.com' AND deleted_at IS NULL;
COMMIT;


-- =============================================================================
-- SECCIÓN 5 — ACTIVAR / DESACTIVAR USUARIO
-- =============================================================================

-- Desactivar (el usuario ya no puede iniciar sesión — RLS lo bloquea):
UPDATE public.staff_members
SET is_active = false
WHERE email = 'usuario@tudominio.com' AND deleted_at IS NULL;

-- Reactivar:
UPDATE public.staff_members
SET is_active = true
WHERE email = 'usuario@tudominio.com' AND deleted_at IS NULL;

-- Soft-delete (desaparece del listado, historial de turnos intacto):
UPDATE public.staff_members
SET is_active = false, deleted_at = now()
WHERE email = 'usuario@tudominio.com';


-- =============================================================================
-- SECCIÓN 6 — CAMBIAR CONTRASEÑA (desde Supabase Dashboard o Admin API)
-- =============================================================================
--
-- Opción 1 — Dashboard:
--   Authentication → Users → clic en el usuario → "Send password reset"
--   o directamente editar la contraseña en el panel.
--
-- Opción 2 — Admin API:
--   PATCH https://<project>.supabase.co/auth/v1/admin/users/<UUID>
--   Authorization: Bearer <SERVICE_ROLE_KEY>
--   Content-Type: application/json
--   { "password": "NuevaContraseña123!" }
--
-- Opción 3 — Desde la app (dueño):
--   Staff → clic en el miembro → campo "Nueva contraseña" → Guardar.
--   La app usa el Admin SDK server-side (supabase.auth.admin.updateUserById).


-- =============================================================================
-- SECCIÓN 7 — CONSULTAS DE VERIFICACIÓN
-- =============================================================================

-- Ver todos los usuarios activos con su rol y si son dueños:
SELECT
  sm.full_name,
  sm.email,
  sm.role,
  sm.is_owner,
  sm.is_active,
  sm.auth_user_id,
  sm.created_at
FROM public.staff_members sm
WHERE sm.clinic_id = '791f2ec3-f0b9-4a60-92fb-330ea52433aa'
  AND sm.deleted_at IS NULL
ORDER BY sm.is_owner DESC, sm.role, sm.full_name;

-- Ver dueños activos de la clínica (debe haber al menos uno):
SELECT full_name, email, is_active
FROM public.staff_members
WHERE clinic_id = '791f2ec3-f0b9-4a60-92fb-330ea52433aa'
  AND is_owner = true
  AND deleted_at IS NULL;

-- Ver doctores con su professional_id (necesario para turnos y Google Calendar):
SELECT
  sm.full_name,
  sm.email,
  p.id AS professional_id,
  p.license_number
FROM public.staff_members sm
LEFT JOIN public.professionals p ON p.staff_member_id = sm.id
WHERE sm.clinic_id = '791f2ec3-f0b9-4a60-92fb-330ea52433aa'
  AND sm.role = 'doctor'
  AND sm.deleted_at IS NULL
ORDER BY sm.full_name;

-- Verificar que el auth_user_id coincide con un usuario real de auth.users:
SELECT
  sm.email,
  sm.role,
  sm.is_owner,
  au.email AS auth_email,
  au.created_at AS auth_created_at,
  au.last_sign_in_at
FROM public.staff_members sm
LEFT JOIN auth.users au ON au.id = sm.auth_user_id
WHERE sm.clinic_id = '791f2ec3-f0b9-4a60-92fb-330ea52433aa'
  AND sm.deleted_at IS NULL
ORDER BY sm.role;
