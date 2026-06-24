-- =============================================================================
-- 0019 — Especialidades y campos clínicos administrables por clínica
-- =============================================================================
-- Hasta ahora las especialidades (presets de campos) y el catálogo de campos
-- especializados vivían SOLO en el frontend (clinical-fields.ts). Esto los hace
-- editables por la clínica: el admin puede agregar / modificar / borrar
-- especialidades y definir campos clínicos propios, persistidos por clínica.
--
-- Modelo:
--   • clinic_specialties        → presets editables (qué campos base / sistemas
--                                  del examen físico / campos especializados activa
--                                  cada especialidad). slug = id estable usado en
--                                  professionals.note_field_config.especialidad.
--   • clinic_specialty_fields   → campos clínicos PROPIOS de la clínica que
--                                  extienden el catálogo estático del frontend.
--
-- Seguridad:
--   • Lectura: cualquier staff de la clínica (el profesional necesita ver las
--     especialidades para configurar su formulario).
--   • Escritura: SOLO admin (dueño/gestión). Recepción y doctor no escriben.
--   • clinic_bot: sin acceso (borde duro — no toca configuración clínica).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Especialidades (presets de campos) por clínica
-- -----------------------------------------------------------------------------
create table if not exists clinic_specialties (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references clinics(id),
  slug             text not null,
  label            text not null,
  base_off         text[] not null default '{}',   -- campos base a DESACTIVAR
  exam_systems     text[] not null default '{}',   -- sistemas del examen físico a ACTIVAR
  specialty_fields text[] not null default '{}',   -- campos especializados a ACTIVAR
  is_builtin       boolean not null default false, -- sembrado desde los presets base
  sort_order       int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  constraint uq_clinic_specialty_slug unique (clinic_id, slug)
);
create index if not exists idx_clinic_specialties_clinic
  on clinic_specialties (clinic_id);

-- -----------------------------------------------------------------------------
-- 2. Campos clínicos propios de la clínica (extienden el catálogo del frontend)
-- -----------------------------------------------------------------------------
create table if not exists clinic_specialty_fields (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id),
  key         text not null,                 -- usado en structured_data.especializados.<key>
  label       text not null,
  placeholder text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint uq_clinic_specialty_field_key unique (clinic_id, key)
);
create index if not exists idx_clinic_specialty_fields_clinic
  on clinic_specialty_fields (clinic_id);

-- -----------------------------------------------------------------------------
-- 3. RLS — lectura para toda la clínica, escritura solo admin
-- -----------------------------------------------------------------------------
alter table clinic_specialties      enable row level security;
alter table clinic_specialty_fields enable row level security;

-- Lectura: cualquier miembro de la clínica.
drop policy if exists tenant_read on clinic_specialties;
create policy tenant_read on clinic_specialties
  for select using (clinic_id = auth_clinic_id());

drop policy if exists tenant_read on clinic_specialty_fields;
create policy tenant_read on clinic_specialty_fields
  for select using (clinic_id = auth_clinic_id());

-- Escritura (insert/update/delete): solo admin de la misma clínica.
drop policy if exists admin_write on clinic_specialties;
create policy admin_write on clinic_specialties
  for all
  using  (clinic_id = auth_clinic_id() and auth_role() = 'admin')
  with check (clinic_id = auth_clinic_id() and auth_role() = 'admin');

drop policy if exists admin_write on clinic_specialty_fields;
create policy admin_write on clinic_specialty_fields
  for all
  using  (clinic_id = auth_clinic_id() and auth_role() = 'admin')
  with check (clinic_id = auth_clinic_id() and auth_role() = 'admin');

-- -----------------------------------------------------------------------------
-- 4. updated_at automático + auditoría (mismas funciones que el resto)
-- -----------------------------------------------------------------------------
drop trigger if exists trg_upd_clinic_specialties on clinic_specialties;
create trigger trg_upd_clinic_specialties before update on clinic_specialties
  for each row execute function set_updated_at();

drop trigger if exists trg_upd_clinic_specialty_fields on clinic_specialty_fields;
create trigger trg_upd_clinic_specialty_fields before update on clinic_specialty_fields
  for each row execute function set_updated_at();

drop trigger if exists trg_audit_clinic_specialties on clinic_specialties;
create trigger trg_audit_clinic_specialties
  after insert or update or delete on clinic_specialties
  for each row execute function audit_trigger();

drop trigger if exists trg_audit_clinic_specialty_fields on clinic_specialty_fields;
create trigger trg_audit_clinic_specialty_fields
  after insert or update or delete on clinic_specialty_fields
  for each row execute function audit_trigger();

-- -----------------------------------------------------------------------------
-- 5. El bot (clinic_bot) no toca configuración clínica.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'clinic_bot') then
    revoke all on clinic_specialties      from clinic_bot;
    revoke all on clinic_specialty_fields from clinic_bot;
  end if;
end $$;
