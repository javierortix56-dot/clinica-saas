-- =============================================================================
-- MIGRACIÓN 0005 — Soporte de sincronización con Google Calendar
-- Aditiva sobre 0001-0004.
-- =============================================================================
-- Modelo de propiedad del dato (fuente única de verdad preservada):
--   * Turnos de trabajo  -> Postgres es dueño; se ESCRIBEN en target_calendar_id.
--   * Bloqueos personales -> el profesional es dueño en su calendario primario;
--     se LEEN de source_calendar_id y se importan como availability_exceptions
--     de tipo 'block'. El motor (slot_is_available) ya los respeta.
--   * Al usar calendarios distintos para escribir y leer, no hay loop de sync.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Origen y referencia externa de cada excepción de disponibilidad.
--    Distingue bloqueos creados a mano de los importados de Google, y permite
--    reconciliar (actualizar/borrar) cuando el evento cambia en Google.
-- -----------------------------------------------------------------------------
alter table availability_exceptions
  add column source            text not null default 'manual',  -- 'manual' | 'google_calendar'
  add column external_event_id text;                             -- id del evento en Google

-- Evita importar dos veces el mismo evento de Google al re-sincronizar.
create unique index uq_exception_external
  on availability_exceptions (professional_id, external_event_id)
  where external_event_id is not null and deleted_at is null;

-- -----------------------------------------------------------------------------
-- 2. Conexión de cada profesional con su Google Calendar.
--    NOTA DE SEGURIDAD: los tokens OAuth NO se guardan en claro aquí.
--    Se almacenan en Supabase Vault y se referencian con oauth_secret_ref.
-- -----------------------------------------------------------------------------
create table professional_calendar_links (
  id                 uuid primary key default gen_random_uuid(),
  clinic_id          uuid not null references clinics(id),
  professional_id    uuid not null unique references professionals(id),
  provider           text not null default 'google',
  source_calendar_id text,        -- calendario PERSONAL del que se leen bloqueos
  target_calendar_id text,        -- calendario DEDICADO donde se escriben turnos
  sync_token         text,        -- token de sincronización incremental de Google
  oauth_secret_ref   text,        -- referencia al secreto en Supabase Vault
  is_active          boolean not null default true,
  last_synced_at     timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);
create index on professional_calendar_links (clinic_id);

-- -----------------------------------------------------------------------------
-- 3. RLS + auditoría + updated_at
-- -----------------------------------------------------------------------------
alter table professional_calendar_links enable row level security;
create policy tenant_all on professional_calendar_links
  for all using (clinic_id = auth_clinic_id()) with check (clinic_id = auth_clinic_id());

create trigger trg_upd_calendar_links before update on professional_calendar_links
  for each row execute function set_updated_at();
create trigger trg_audit_calendar_links after insert or update or delete
  on professional_calendar_links for each row execute function audit_trigger();

-- =============================================================================
-- FIN migración 0005
-- =============================================================================
