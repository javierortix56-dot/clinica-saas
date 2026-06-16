-- =============================================================================
-- MIGRACIÓN 0007 — Custom Access Token Hook (inyección de claims en el JWT)
-- Aditiva sobre 0001-0006.
-- =============================================================================
-- Objetivo:
--   Inyectar `clinic_id` y `user_role` como claims top-level del JWT a partir de
--   la fila de `staff_members` del usuario que inicia sesión. Estos claims son la
--   base de TODO el aislamiento multi-tenant + RBAC: las funciones auth_clinic_id()
--   y auth_role() (ver 0001 §2) los leen, y las políticas RLS `tenant_all` filtran
--   por `clinic_id = auth_clinic_id()`.
--
-- Por qué SECURITY DEFINER:
--   El hook se ejecuta en el momento de EMISIÓN del token, cuando todavía no hay
--   claims en el JWT. Por lo tanto RLS sobre `staff_members` (que filtra por
--   auth_clinic_id()) no puede resolver nada útil aún. La función debe leer la
--   fila del staff salteando RLS -> SECURITY DEFINER (corre con privilegios del
--   owner de la función, no del invocante).
--
-- Endurecimiento contra search_path hijacking:
--   Una función SECURITY DEFINER sin search_path fijo es explotable: un atacante
--   que controle el search_path de la sesión podría resolver `staff_members` (o
--   funciones/operadores) a objetos maliciosos en otro schema. Por eso fijamos
--   `set search_path = public` (sin schemas de usuario) en la propia función.
-- =============================================================================

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id   uuid;
  v_clinic_id uuid;
  v_role      user_role;
  v_claims    jsonb;
begin
  -- Identidad del usuario para quien se está emitiendo el token.
  v_user_id := (event ->> 'user_id')::uuid;

  -- Claims actuales del evento (Supabase Auth los provee bajo 'claims').
  v_claims := coalesce(event -> 'claims', '{}'::jsonb);

  -- Membresía de staff ACTIVA y no borrada del usuario.
  select s.clinic_id, s.role
    into v_clinic_id, v_role
  from staff_members s
  where s.auth_user_id = v_user_id
    and s.is_active = true
    and s.deleted_at is null
  limit 1;

  -- Si hay membresía activa, inyectamos los claims custom. Si no, devolvemos el
  -- evento intacto: un usuario sin staff activo no recibe clinic_id y RLS lo deja
  -- sin acceso (comportamiento correcto, sin fallar la emisión del token).
  if found then
    v_claims := v_claims
      || jsonb_build_object('clinic_id', v_clinic_id::text)
      || jsonb_build_object('user_role', v_role::text);

    event := jsonb_set(event, '{claims}', v_claims);
  end if;

  return event;
end;
$$;

-- -----------------------------------------------------------------------------
-- PERMISOS — críticos para que Supabase Auth pueda ejecutar el hook.
--   Supabase Auth ejecuta los hooks con el rol `supabase_auth_admin`. Ese rol
--   necesita: poder ejecutar la función, usar el schema, y (como la función es
--   SECURITY DEFINER pero igual conviene ser explícito) leer staff_members.
--   El resto de roles NO debe poder invocar el hook directamente.
-- -----------------------------------------------------------------------------
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
grant select on table public.staff_members to supabase_auth_admin;

revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- =============================================================================
-- PASO MANUAL DE ACTIVACIÓN (NO se hace por SQL)
-- =============================================================================
-- Crear la función NO la activa. Hay que registrarla como hook de access token:
--
--   Opción A — Dashboard de Supabase:
--     Authentication -> Hooks -> "Customize Access Token (JWT) Claims"
--     -> seleccionar la función public.custom_access_token_hook y habilitarla.
--
--   Opción B — Supabase CLI (config.toml):
--     [auth.hook.custom_access_token]
--     enabled = true
--     uri = "pg-functions://postgres/public/custom_access_token_hook"
--
-- Sin este paso de activación, la función existe en la base pero Supabase Auth
-- nunca la ejecuta, y los JWT se emiten SIN clinic_id ni user_role (todo el
-- acceso vía RLS quedaría denegado). Verificar tras activar: decodificar un JWT
-- recién emitido y confirmar la presencia de ambos claims.
-- =============================================================================
-- FIN migración 0007
-- =============================================================================
