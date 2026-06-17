-- =============================================================================
-- USUARIOS DE PRUEBA — Fase 14 RBAC
-- =============================================================================
-- PROPÓSITO: Crear tres usuarios de prueba con distintos roles para verificar
-- el comportamiento del RBAC en el frontend.
--
-- CÓMO EJECUTAR:
--   1. Ir a Supabase Dashboard → Authentication → Users
--   2. Crear manualmente cada usuario con "Add user" (email + password).
--      Password sugerida: Test1234! (cambiar en producción).
--   3. Copiar el UUID generado para cada usuario (columna "UID").
--   4. En SQL Editor, reemplazar los placeholders <UUID_ADMIN>, <UUID_DOCTOR>,
--      <UUID_RECEPCION> con los UUIDs reales y ejecutar este script.
--
-- ALTERNATIVA (solo en entornos de desarrollo con service_role key):
--   Ejecutar desde la API de Supabase Admin:
--   POST /auth/v1/admin/users con { email, password, email_confirm: true }
--   Luego ejecutar el bloque INSERT de staff_members con el UUID devuelto.
--
-- NOTA SOBRE EL HOOK:
--   El Custom Access Token Hook (migración 0007) lee user_role desde el claim
--   app_metadata del usuario en auth.users. El hook se activa automáticamente
--   al generar cada token — no requiere configuración adicional.
--   El claim se inyecta desde staff_members.role vía la función SQL del hook.
-- =============================================================================

-- PASO 1: Reemplazá estos valores con los UUIDs reales de auth.users
-- y el clinic_id de tu clínica de prueba.
DO $$
DECLARE
  v_clinic_id  uuid := '791f2ec3-f0b9-4a60-92fb-330ea52433aa'; -- seed clinic
  v_uuid_admin       uuid := '<UUID_ADMIN>';        -- UUID del usuario admin@test.com
  v_uuid_doctor      uuid := '<UUID_DOCTOR>';       -- UUID del usuario doctor@test.com
  v_uuid_recepcion   uuid := '<UUID_RECEPCION>';    -- UUID del usuario recepcion@test.com
BEGIN

  -- ── Admin ────────────────────────────────────────────────────────────────────
  INSERT INTO public.staff_members (auth_user_id, clinic_id, role, full_name, email, is_active)
  VALUES (v_uuid_admin, v_clinic_id, 'admin', 'Admin Test', 'admin@test.com', true)
  ON CONFLICT (auth_user_id) DO NOTHING;

  -- ── Doctor ───────────────────────────────────────────────────────────────────
  INSERT INTO public.staff_members (auth_user_id, clinic_id, role, full_name, email, is_active)
  VALUES (v_uuid_doctor, v_clinic_id, 'doctor', 'Doctor Test', 'doctor@test.com', true)
  ON CONFLICT (auth_user_id) DO NOTHING;

  -- Fila en professionals requerida para que el doctor pueda crear notas clínicas.
  INSERT INTO public.professionals (staff_member_id, clinic_id)
  SELECT id, clinic_id FROM public.staff_members WHERE auth_user_id = v_uuid_doctor
  ON CONFLICT (staff_member_id) DO NOTHING;

  -- ── Recepción ────────────────────────────────────────────────────────────────
  INSERT INTO public.staff_members (auth_user_id, clinic_id, role, full_name, email, is_active)
  VALUES (v_uuid_recepcion, v_clinic_id, 'reception', 'Recepción Test', 'recepcion@test.com', true)
  ON CONFLICT (auth_user_id) DO NOTHING;

END $$;

-- =============================================================================
-- VERIFICACIÓN (ejecutar luego del INSERT):
-- =============================================================================
-- SELECT sm.full_name, sm.role, sm.email, sm.auth_user_id
-- FROM public.staff_members sm
-- WHERE sm.email IN ('admin@test.com', 'doctor@test.com', 'recepcion@test.com')
-- ORDER BY sm.role;

-- =============================================================================
-- QUÉ PROBAR POR ROL:
-- =============================================================================
-- admin@test.com    → Ve todos los links del nav incluido "Ajustes"
--                     Badge gris oscuro "Admin"
--                     Puede crear notas clínicas en /patients/[id]
--                     Accede a /settings sin redirect
--
-- doctor@test.com   → Ve todos los links del nav EXCEPTO "Ajustes"
--                     Badge azul "Profesional"
--                     Puede crear notas clínicas en /patients/[id]
--                     Intento de acceso a /settings → redirect a /approvals
--
-- recepcion@test.com → Ve todos los links del nav EXCEPTO "Ajustes"
--                      Badge verde "Recepción"
--                      NO ve botón "Nueva nota" en /patients/[id]
--                      Intento de acceso a /settings → redirect a /approvals
-- =============================================================================
