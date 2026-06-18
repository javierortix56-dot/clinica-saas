-- =============================================================================
-- MIGRACIÓN 0009 — Portal del paciente: enum, RLS y hook extension
-- =============================================================================
-- ATENCIÓN: el primer statement (ALTER TYPE ... ADD VALUE) NO puede ejecutarse
-- dentro de un bloque transaccional en PostgreSQL. Ejecutar este archivo en el
-- SQL Editor de Supabase (que no envuelve en transacción automáticamente) o
-- separar el primer statement y correrlo antes del resto.
-- =============================================================================

-- 1. Agregar 'patient' al enum user_role (fuera de transacción).
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'patient';

-- 2. Función auxiliar: lee el patient_id del JWT (análoga a auth_clinic_id()).
CREATE OR REPLACE FUNCTION public.auth_patient_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT nullif(auth.jwt() ->> 'patient_id', '')::uuid;
$$;

GRANT EXECUTE ON FUNCTION public.auth_patient_id() TO authenticated, anon;

-- 3. Policy SELECT en patients para el rol patient.
--    El paciente solo ve su propia fila. Se suma a tenant_all (OR lógico).
CREATE POLICY patient_view_self ON public.patients
  FOR SELECT
  USING (id = public.auth_patient_id() AND public.auth_role() = 'patient');

-- 4. Policy SELECT en appointments para el rol patient.
--    El paciente solo ve sus propios turnos (sin requerir clinic_id en el JWT).
CREATE POLICY patient_view_own ON public.appointments
  FOR SELECT
  USING (patient_id = public.auth_patient_id() AND public.auth_role() = 'patient');

-- 5. Extender el Custom Access Token Hook para inyectar claims de paciente.
--    Si no hay staff activo para el usuario, busca en patients por email.
--    Deuda técnica: si el email pertenece a pacientes en múltiples clínicas,
--    se toma el más antiguo (created_at ASC). Ver blueprint fase15 §8.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid;
  v_clinic_id uuid;
  v_role      user_role;
  v_patient_id uuid;
  v_email     text;
  v_claims    jsonb;
BEGIN
  v_user_id := (event ->> 'user_id')::uuid;
  v_claims  := COALESCE(event -> 'claims', '{}'::jsonb);

  -- Intentar membresía de staff activa.
  SELECT s.clinic_id, s.role
    INTO v_clinic_id, v_role
  FROM staff_members s
  WHERE s.auth_user_id = v_user_id
    AND s.is_active = true
    AND s.deleted_at IS NULL
  LIMIT 1;

  IF found THEN
    -- Usuario de staff: inyectar clinic_id y user_role.
    v_claims := v_claims
      || jsonb_build_object('clinic_id', v_clinic_id::text)
      || jsonb_build_object('user_role', v_role::text);
    event := jsonb_set(event, '{claims}', v_claims);
  ELSE
    -- No es staff: buscar paciente por email del JWT.
    v_email := event -> 'claims' ->> 'email';
    IF v_email IS NOT NULL THEN
      SELECT p.id
        INTO v_patient_id
      FROM patients p
      WHERE p.email = v_email
      ORDER BY p.created_at ASC
      LIMIT 1;

      IF found THEN
        v_claims := v_claims
          || jsonb_build_object('patient_id', v_patient_id::text)
          || jsonb_build_object('user_role', 'patient');
        event := jsonb_set(event, '{claims}', v_claims);
      END IF;
    END IF;
  END IF;

  RETURN event;
END;
$$;

-- 6. Permisos del hook (mismo patrón que migración 0007).
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;

-- 7. El hook (SECURITY DEFINER) necesita leer patients para inyectar patient_id.
GRANT SELECT ON TABLE public.patients TO supabase_auth_admin;

-- =============================================================================
-- FIN migración 0009
-- =============================================================================
