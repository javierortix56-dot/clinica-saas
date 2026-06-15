-- =============================================================================
-- 0006 — Rol de conexión least-privilege para el bot de WhatsApp
-- =============================================================================
-- Blueprint Fase 8 · Paso 5 §2 / §A1.
--
-- El bot escribe por DATABASE_URL con un rol que BYPASSEA RLS (la aislación
-- tenant queda a nivel de código: toda query filtra por clinic_id explícito,
-- igual que hoy). El borde duro de §6 (el bot NUNCA ve notas clínicas) se impone
-- a nivel de privilegios: se le revoca todo acceso a `clinical_notes`, de modo
-- que aunque un bug intente consultarla, Postgres responde 42501
-- (insufficient_privilege) y el código lo degrada a INTERNAL_ERROR genérico sin
-- filtrar que la tabla existe (ver §4 del blueprint).
--
-- Compatibilidad con runAsActor/runAsBot (Paso 2): `set_config('app.actor_id'...)`
-- y `set_config('app.source'...)` usan GUCs custom del namespace `app.*`,
-- seteables por cualquier rol de login; el cambio de rol NO rompe la auditoría.
--
-- NOTA OPERATIVA: crear un rol con BYPASSRLS requiere privilegios de superuser/
-- rol con CREATEROLE+BYPASSRLS (en Supabase, el rol `postgres` de las migraciones
-- los tiene). El password real se setea fuera del SQL versionado (Vault / variable
-- de entorno) y DATABASE_URL del bot apunta a este rol.
-- =============================================================================

-- 1. Rol de login del bot: NOSUPERUSER + BYPASSRLS, sin password en el versionado.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'clinic_bot') then
    create role clinic_bot login nosuperuser bypassrls;
  else
    -- Idempotencia: asegura los atributos aunque el rol ya exista.
    alter role clinic_bot login nosuperuser bypassrls;
  end if;
end
$$;

-- 2. Privilegios operativos mínimos sobre las tablas que el bot realmente usa.
grant usage on schema public to clinic_bot;

grant select, insert, update on
  patients,
  treatments,
  appointments,
  appointment_modifiers,
  treatment_types,
  treatment_phase_templates,
  technology_modifiers,
  professionals,
  staff_members,
  clinics,
  professional_availability,
  availability_exceptions,
  whatsapp_channels,
  conversations,
  conversation_messages
to clinic_bot;

-- Auditoría append-only: el trigger de auditoría inserta como rol invocante.
grant insert, select on audit_logs to clinic_bot;
grant usage, select on sequence audit_logs_id_seq to clinic_bot;

-- 3. BORDE DURO §6: el bot NUNCA accede a notas clínicas.
--    No se concede ningún privilegio sobre clinical_notes (no aparece en el grant
--    de arriba); este revoke es defensivo y explícito ante cualquier grant previo.
revoke all on clinical_notes from clinic_bot;
