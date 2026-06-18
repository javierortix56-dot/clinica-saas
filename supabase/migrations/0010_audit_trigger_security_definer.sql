-- Migration 0010: Fix audit_trigger permissions
--
-- Problem: audit_trigger() runs as SECURITY INVOKER (default), so when the
-- Supabase authenticated role (anon/authenticated) triggers a write on
-- appointments/treatments/patients, the trigger tries to INSERT into audit_logs
-- but the authenticated user has no INSERT policy on that table (only SELECT).
--
-- Fix: Redefine audit_trigger() as SECURITY DEFINER so it always executes with
-- the function owner's permissions (postgres), bypassing RLS on audit_logs.
-- This is the standard pattern for audit triggers.
--
-- set search_path = public prevents search_path hijacking (security best practice
-- for SECURITY DEFINER functions).

create or replace function audit_trigger()
returns trigger language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := coalesce(
    nullif(current_setting('app.actor_id', true), '')::uuid,
    (auth.jwt() ->> 'sub')::uuid
  );
  v_role  text := coalesce(auth.jwt() ->> 'user_role', 'system');
  v_src   text := coalesce(nullif(current_setting('app.source', true), ''), 'staff');
  v_clinic uuid;
  v_rec    uuid;
begin
  if tg_op = 'DELETE' then
    v_clinic := old.clinic_id; v_rec := old.id;
  else
    v_clinic := new.clinic_id; v_rec := new.id;
  end if;

  insert into audit_logs(clinic_id, table_name, record_id, action,
                         actor_id, actor_role, source, old_data, new_data)
  values (
    v_clinic, tg_table_name, v_rec, tg_op, v_actor, v_role, v_src,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
