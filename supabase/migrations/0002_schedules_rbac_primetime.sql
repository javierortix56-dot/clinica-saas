-- =============================================================================
-- MIGRACIÓN 0002 — Disponibilidad estricta + Prime time POR PROFESIONAL + RBAC clínico
-- Reemplaza a la versión anterior de la 02. Aditiva sobre 0001_core.sql.
-- =============================================================================
-- Decisiones de negocio confirmadas:
--   * Disponibilidad: INVIOLABLE. No se puede agendar fuera del horario del
--     profesional, salvo que exista una excepción 'extra' que abra esa franja
--     (vía para urgencias).
--   * Prime time: configurable POR PROFESIONAL (no por clínica).
-- =============================================================================

-- 0. Alinear vocabulario de roles (v1 -> v2)
alter type user_role rename value 'owner' to 'admin';
alter type user_role rename value 'professional' to 'doctor';

-- 0.b Prime time deja de vivir en la clínica y pasa al profesional.
alter table professionals
  add column prime_time_start time not null default '17:00',
  add column prime_time_end   time not null default '20:00';
-- (Las columnas equivalentes en clinics quedan obsoletas; se pueden ignorar
--  o limpiar en una migración futura. No las borramos aquí para no romper nada.)

-- -----------------------------------------------------------------------------
-- 1. DISPONIBILIDAD RECURRENTE (weekday: 0=Domingo ... 6=Sábado)
-- -----------------------------------------------------------------------------
create table professional_availability (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinics(id),
  professional_id uuid not null references professionals(id),
  weekday         smallint not null check (weekday between 0 and 6),
  start_time      time not null,
  end_time        time not null,
  effective_from  date not null default current_date,
  effective_to    date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint chk_avail_time check (end_time > start_time)
);
create index on professional_availability (professional_id, weekday);

-- -----------------------------------------------------------------------------
-- 2. EXCEPCIONES ('block' = vacaciones/resta · 'extra' = urgencia/suma)
-- -----------------------------------------------------------------------------
create type availability_exception_kind as enum ('block', 'extra');

create table availability_exceptions (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinics(id),
  professional_id uuid not null references professionals(id),
  kind            availability_exception_kind not null,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  reason          text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint chk_exc_time check (ends_at > starts_at)
);
create index on availability_exceptions (professional_id, starts_at);

-- -----------------------------------------------------------------------------
-- 3. HELPER: ¿el slot cae en disponibilidad real? (recurrente o extra, sin block)
-- -----------------------------------------------------------------------------
create or replace function slot_is_available(
  p_professional_id uuid, p_start timestamptz, p_end timestamptz
) returns boolean
language plpgsql stable as $$
declare
  v_tz text; v_dow int; v_ls time; v_le time; v_date date;
  v_base boolean; v_extra boolean; v_blocked boolean;
begin
  select c.timezone into v_tz
  from professionals pr join clinics c on c.id = pr.clinic_id
  where pr.id = p_professional_id;

  v_dow  := extract(dow from (p_start at time zone v_tz))::int;
  v_ls   := (p_start at time zone v_tz)::time;
  v_le   := (p_end   at time zone v_tz)::time;
  v_date := (p_start at time zone v_tz)::date;

  select exists (
    select 1 from professional_availability a
    where a.professional_id = p_professional_id and a.deleted_at is null
      and a.weekday = v_dow
      and a.start_time <= v_ls and a.end_time >= v_le
      and a.effective_from <= v_date
      and (a.effective_to is null or a.effective_to >= v_date)
  ) into v_base;

  select exists (
    select 1 from availability_exceptions e
    where e.professional_id = p_professional_id and e.deleted_at is null
      and e.kind = 'extra' and e.starts_at <= p_start and e.ends_at >= p_end
  ) into v_extra;

  select exists (
    select 1 from availability_exceptions e
    where e.professional_id = p_professional_id and e.deleted_at is null
      and e.kind = 'block'
      and tstzrange(e.starts_at, e.ends_at) && tstzrange(p_start, p_end)
  ) into v_blocked;

  return (v_base or v_extra) and not v_blocked;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. TRIGGER: DISPONIBILIDAD ESTRICTA (inviolable)
--    Rechaza turnos fuera de disponibilidad. Las urgencias se habilitan creando
--    primero una excepción 'extra'.
-- -----------------------------------------------------------------------------
create or replace function enforce_availability()
returns trigger language plpgsql as $$
begin
  if new.status in ('cancelled', 'no_show') then
    return new;
  end if;
  if not slot_is_available(new.professional_id, new.start_at, new.end_at) then
    raise exception
      'El profesional no tiene disponibilidad para el rango % – %.',
      new.start_at, new.end_at
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_enforce_availability
  before insert or update of start_at, end_at, professional_id, status
  on appointments for each row execute function enforce_availability();

-- -----------------------------------------------------------------------------
-- 5. TRIGGER: PRIME TIME POR PROFESIONAL (Regla 3) — lee la banda del profesional
-- -----------------------------------------------------------------------------
create or replace function enforce_prime_time_restriction()
returns trigger language plpgsql as $$
declare
  v_no_shows int; v_tz text; v_ps time; v_pe time; v_ls time; v_le time;
begin
  if new.status in ('cancelled', 'no_show') then
    return new;
  end if;

  select count(*) into v_no_shows
  from appointments
  where patient_id = new.patient_id and status = 'no_show'
    and deleted_at is null and id <> new.id;

  if v_no_shows < 2 then
    return new;
  end if;

  -- Banda prime del PROFESIONAL del turno.
  select pr.prime_time_start, pr.prime_time_end, c.timezone
    into v_ps, v_pe, v_tz
  from professionals pr join clinics c on c.id = pr.clinic_id
  where pr.id = new.professional_id;

  v_ls := (new.start_at at time zone v_tz)::time;
  v_le := (new.end_at   at time zone v_tz)::time;

  if v_ls < v_pe and v_le > v_ps then
    raise exception
      'Paciente con % ausencias: prohibido prime time (%–% del profesional).',
      v_no_shows, v_ps, v_pe
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger trg_prime_time
  before insert or update of start_at, end_at, status, patient_id
  on appointments for each row execute function enforce_prime_time_restriction();

-- -----------------------------------------------------------------------------
-- 6. RBAC — FICHA CLÍNICA (recepción SIN lectura clínica; solo admin/doctor)
-- -----------------------------------------------------------------------------
create table clinical_notes (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinics(id),
  patient_id   uuid not null references patients(id),
  treatment_id uuid references treatments(id),
  author_id    uuid not null references professionals(id),
  note_type    text not null,
  body         text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index on clinical_notes (clinic_id, patient_id);

-- -----------------------------------------------------------------------------
-- 7. RLS + auditoría + updated_at
-- -----------------------------------------------------------------------------
alter table professional_availability enable row level security;
alter table availability_exceptions   enable row level security;
alter table clinical_notes            enable row level security;

create policy tenant_all on professional_availability
  for all using (clinic_id = auth_clinic_id()) with check (clinic_id = auth_clinic_id());
create policy tenant_all on availability_exceptions
  for all using (clinic_id = auth_clinic_id()) with check (clinic_id = auth_clinic_id());

-- Ficha clínica: SOLO admin/doctor. Recepción no recibe política -> sin acceso.
create policy clinical_admin_doctor on clinical_notes
  for all
  using  (clinic_id = auth_clinic_id() and auth_role() in ('admin','doctor'))
  with check (clinic_id = auth_clinic_id() and auth_role() in ('admin','doctor'));

create trigger trg_audit_availability after insert or update or delete
  on professional_availability for each row execute function audit_trigger();
create trigger trg_audit_exceptions after insert or update or delete
  on availability_exceptions for each row execute function audit_trigger();
create trigger trg_audit_clinical after insert or update or delete
  on clinical_notes for each row execute function audit_trigger();

create trigger trg_upd_availability before update on professional_availability
  for each row execute function set_updated_at();
create trigger trg_upd_exceptions before update on availability_exceptions
  for each row execute function set_updated_at();
create trigger trg_upd_clinical before update on clinical_notes
  for each row execute function set_updated_at();

-- =============================================================================
-- FIN migración 0002
-- =============================================================================
