-- =============================================================================
-- 0016 — Rol "dueño" (owner): un admin con permisos EXCLUSIVOS de gestión
-- =============================================================================
-- Hasta ahora cualquier admin podía gestionar equipo y configuraciones. Este
-- cambio introduce un nivel por encima: el "dueño" (is_owner) es el único que
-- puede dar de alta/baja personal, crear accesos, tocar configuraciones de la
-- clínica e integraciones. Los demás admin operan normalmente (turnos,
-- pacientes, etc.) pero NO acceden a esas áreas.
--
-- Enforcement en dos capas:
--   1. Claim `is_owner` en el JWT (este hook) -> el frontend oculta/redirige.
--   2. RLS dura: la escritura de staff_members y de las tablas de configuración
--      queda restringida a auth_is_owner(). La lectura sigue siendo de toda la
--      clínica (la app necesita leer equipo y catálogos para operar).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columna is_owner
-- -----------------------------------------------------------------------------
alter table staff_members
  add column if not exists is_owner boolean not null default false;

-- -----------------------------------------------------------------------------
-- 2. Bootstrap anti-lockout: si una clínica no tiene dueño, promovemos al admin
--    activo más antiguo. Garantiza que toda clínica existente tenga exactamente
--    un dueño tras la migración (idempotente: no pisa dueños ya marcados).
-- -----------------------------------------------------------------------------
update staff_members s
set is_owner = true
where s.id in (
  select distinct on (clinic_id) id
  from staff_members
  where role = 'admin' and is_active = true and deleted_at is null
  order by clinic_id, created_at asc
)
and not exists (
  select 1 from staff_members o
  where o.clinic_id = s.clinic_id and o.is_owner = true
);

-- -----------------------------------------------------------------------------
-- 3. Custom Access Token Hook — ahora inyecta también is_owner
-- -----------------------------------------------------------------------------
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
  v_is_owner  boolean;
  v_claims    jsonb;
begin
  v_user_id := (event ->> 'user_id')::uuid;
  v_claims  := coalesce(event -> 'claims', '{}'::jsonb);

  select s.clinic_id, s.role, s.is_owner
    into v_clinic_id, v_role, v_is_owner
  from staff_members s
  where s.auth_user_id = v_user_id
    and s.is_active = true
    and s.deleted_at is null
  limit 1;

  if found then
    v_claims := v_claims
      || jsonb_build_object('clinic_id', v_clinic_id::text)
      || jsonb_build_object('user_role', v_role::text)
      || jsonb_build_object('is_owner', coalesce(v_is_owner, false));
    event := jsonb_set(event, '{claims}', v_claims);
  end if;

  return event;
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- -----------------------------------------------------------------------------
-- 4. Helper RLS: ¿el usuario del JWT es dueño?
-- -----------------------------------------------------------------------------
create or replace function auth_is_owner() returns boolean
  language sql stable as $$
  select coalesce((auth.jwt() ->> 'is_owner')::boolean, false);
$$;

-- -----------------------------------------------------------------------------
-- 5. RLS equipo — lectura de toda la clínica, ESCRITURA solo del dueño
-- -----------------------------------------------------------------------------
drop policy if exists tenant_all on staff_members;

create policy staff_select on staff_members
  for select using (clinic_id = auth_clinic_id());

create policy staff_write_owner on staff_members
  for all
  using  (clinic_id = auth_clinic_id() and auth_is_owner())
  with check (clinic_id = auth_clinic_id() and auth_is_owner());

-- -----------------------------------------------------------------------------
-- 6. RLS configuraciones — lectura de la clínica, ESCRITURA solo del dueño
--    (clinics + catálogos clínicos). El rol clinic_bot tiene BYPASSRLS, así que
--    estas políticas no afectan al bot.
-- -----------------------------------------------------------------------------
drop policy if exists tenant_self on clinics;
create policy clinic_select on clinics
  for select using (id = auth_clinic_id());
create policy clinic_write_owner on clinics
  for all
  using  (id = auth_clinic_id() and auth_is_owner())
  with check (id = auth_clinic_id() and auth_is_owner());

do $$
declare t text;
begin
  foreach t in array array[
    'treatment_types','treatment_phase_templates','technology_modifiers'
  ] loop
    execute format('drop policy if exists tenant_all on %1$I', t);
    execute format($f$
      create policy cfg_select on %1$I
        for select using (clinic_id = auth_clinic_id());
    $f$, t);
    execute format($f$
      create policy cfg_write_owner on %1$I
        for all
        using  (clinic_id = auth_clinic_id() and auth_is_owner())
        with check (clinic_id = auth_clinic_id() and auth_is_owner());
    $f$, t);
  end loop;
end $$;
