-- =============================================================================
-- SISTEMA INTELIGENTE DE GESTIÓN ODONTOLÓGICA
-- Esquema relacional v1 — Postgres / Supabase
-- Arquitectura: Single-Database multi-tenant con RLS estricto por clinic_id
-- =============================================================================
-- Invariantes garantizados a NIVEL DE MOTOR (no de aplicación):
--   1. Aislamiento multi-tenant            -> RLS por clinic_id
--   2. No doble-booking por profesional    -> EXCLUDE USING gist
--   3. Secuencialidad + cool-down de fases  -> trigger validate_treatment_sequence
--   4. Trazabilidad inmutable               -> audit_logs append-only
--   5. Sin hard-delete                      -> columna deleted_at (soft delete)
-- La lógica DETERMINISTA de calibración de tiempos (base + modificadores) vive
-- en el backend; la BD solo persiste el resultado y AUDITA qué se aplicó.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. EXTENSIONES
-- -----------------------------------------------------------------------------
create extension if not exists pgcrypto;     -- gen_random_uuid()
create extension if not exists btree_gist;   -- requerido por EXCLUDE con '=' sobre uuid

-- -----------------------------------------------------------------------------
-- 1. TIPOS ENUMERADOS
-- -----------------------------------------------------------------------------
create type user_role        as enum ('owner', 'professional', 'reception');
create type appointment_status as enum
  ('proposed', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show');
create type treatment_status as enum
  ('planned', 'in_progress', 'completed', 'cancelled');
-- 'clinical' = fase que ocupa sillón y requiere turno.
-- 'lab_wait' = bloqueo de laboratorio (NO genera turno, solo impone cool-down).
create type phase_kind       as enum ('clinical', 'lab_wait');

-- -----------------------------------------------------------------------------
-- 2. HELPERS DE CONTEXTO (leen los claims del JWT de Supabase)
--    Para escrituras del Bot (service_role, sin 'sub'), ver app.actor_id en §8.
-- -----------------------------------------------------------------------------
create or replace function auth_clinic_id() returns uuid
  language sql stable as $$
  select nullif(auth.jwt() ->> 'clinic_id', '')::uuid;
$$;

create or replace function auth_role() returns text
  language sql stable as $$
  select auth.jwt() ->> 'user_role';
$$;

-- updated_at automático
create or replace function set_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. TENANT + STAFF + PACIENTES
-- -----------------------------------------------------------------------------
create table clinics (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  timezone    text not null default 'America/Argentina/Buenos_Aires',
  -- Banda de "prime time" (Regla 3) configurable por clínica.
  prime_time_start time not null default '17:00',
  prime_time_end   time not null default '20:00',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- Vincula la identidad de Supabase Auth (auth.users) con una clínica y un rol.
create table staff_members (
  id          uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,           -- references auth.users(id)
  clinic_id   uuid not null references clinics(id),
  role        user_role not null,
  full_name   text not null,
  email       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index on staff_members (clinic_id);

-- Un profesional ES un staff_member con rol 'professional', extendido con
-- datos clínicos. Se separa para no contaminar la tabla de staff.
create table professionals (
  id            uuid primary key default gen_random_uuid(),
  staff_member_id uuid not null unique references staff_members(id),
  clinic_id     uuid not null references clinics(id),
  license_number text,
  specialties   text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index on professionals (clinic_id);

create table patients (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinics(id),
  national_id  text not null,                  -- DNI/ID (Regla de validación de la IA)
  full_name    text not null,
  phone        text,                           -- E.164, para WhatsApp Cloud API
  birth_date   date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  -- El DNI es único POR CLÍNICA, no globalmente (un mismo DNI puede ser
  -- paciente en clínicas distintas en el modelo single-DB multi-tenant).
  constraint uq_patient_national_id unique (clinic_id, national_id)
);
create index on patients (clinic_id);

-- -----------------------------------------------------------------------------
-- 4. CATÁLOGO DE TRATAMIENTOS (plantillas) + MODIFICADORES TECNOLÓGICOS
-- -----------------------------------------------------------------------------
create table treatment_types (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id),
  name        text not null,                   -- p.ej. 'Corona de Zirconio'
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index on treatment_types (clinic_id);

-- Define la SECUENCIA de fases de un tipo de tratamiento (la "plantilla").
-- Ejemplo 'Corona de Zirconio':
--   order=1 clinical 'Tallado'    duration=45
--   order=2 lab_wait 'Laboratorio' cooldown_days=10
--   order=3 clinical 'Cementado'  duration=30
create table treatment_phase_templates (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references clinics(id),
  treatment_type_id uuid not null references treatment_types(id),
  sequence_order    int  not null,             -- orden dentro del tratamiento
  name              text not null,
  phase_kind        phase_kind not null,
  duration_minutes  int,                       -- obligatorio si phase_kind='clinical'
  cooldown_days     int  not null default 0,   -- relevante si phase_kind='lab_wait'
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint uq_phase_order unique (treatment_type_id, sequence_order),
  constraint chk_clinical_has_duration
    check (phase_kind <> 'clinical' or duration_minutes is not null),
  constraint chk_labwait_has_cooldown
    check (phase_kind <> 'lab_wait' or cooldown_days > 0)
);
create index on treatment_phase_templates (treatment_type_id);

-- Regla 2: modificadores de tiempo por tecnología (p.ej. 'Escaneo Digital 3D' = +15').
create table technology_modifiers (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics(id),
  name          text not null,
  extra_minutes int  not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index on technology_modifiers (clinic_id);

-- -----------------------------------------------------------------------------
-- 5. INSTANCIAS OPERATIVAS: tratamiento del paciente + turnos
-- -----------------------------------------------------------------------------
-- Un 'treatment' es el treatment_id que AGRUPA la secuencia de turnos reales.
create table treatments (
  id                    uuid primary key default gen_random_uuid(),
  clinic_id             uuid not null references clinics(id),
  patient_id            uuid not null references patients(id),
  treatment_type_id     uuid not null references treatment_types(id),
  primary_professional_id uuid references professionals(id),
  status                treatment_status not null default 'planned',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);
create index on treatments (clinic_id);
create index on treatments (patient_id);

create table appointments (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references clinics(id),
  -- Nulos => turno simple (valoración, urgencia) que NO pertenece a una secuencia.
  treatment_id     uuid references treatments(id),
  phase_template_id uuid references treatment_phase_templates(id),
  patient_id       uuid not null references patients(id),
  professional_id  uuid not null references professionals(id),
  start_at         timestamptz not null,
  end_at           timestamptz not null,       -- = start + base + modificadores (calcula el backend)
  status           appointment_status not null default 'proposed',
  origin           text not null default 'staff',  -- 'whatsapp_bot' | 'staff'
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  constraint chk_time_order check (end_at > start_at)
);
create index on appointments (clinic_id);
create index on appointments (professional_id, start_at);
create index on appointments (treatment_id);
create index on appointments (patient_id);

-- Traza qué modificadores tecnológicos se aplicaron a un turno (auditabilidad
-- de la calibración de tiempos de la Regla 2).
create table appointment_modifiers (
  appointment_id       uuid not null references appointments(id),
  technology_modifier_id uuid not null references technology_modifiers(id),
  applied_extra_minutes int not null,
  primary key (appointment_id, technology_modifier_id)
);

-- -----------------------------------------------------------------------------
-- 6. PREVENCIÓN DE DOBLE-BOOKING (a nivel de motor)
--    Imposible solapar dos turnos del mismo profesional. La segunda inserción
--    falla atómicamente. Se excluyen cancelados/ausentes y soft-deleted.
-- -----------------------------------------------------------------------------
alter table appointments
  add constraint appt_no_overlap
  exclude using gist (
    professional_id with =,
    tstzrange(start_at, end_at) with &&
  )
  where (status not in ('cancelled', 'no_show') and deleted_at is null);

-- -----------------------------------------------------------------------------
-- 7. SECUENCIALIDAD + COOL-DOWN (Regla 1) a nivel de motor
--    Impide agendar una fase clínica antes de que exista la fase clínica previa
--    y antes de que se cumpla el cool-down de laboratorio entre ambas.
-- -----------------------------------------------------------------------------
create or replace function validate_treatment_sequence()
returns trigger language plpgsql as $$
declare
  v_template       record;
  v_prev_template  record;
  v_required_cd    int;
  v_prev_appt      record;
begin
  -- Solo aplica a turnos que forman parte de una secuencia compuesta.
  if new.phase_template_id is null or new.treatment_id is null then
    return new;
  end if;

  select * into v_template
  from treatment_phase_templates where id = new.phase_template_id;

  -- Fase clínica inmediatamente anterior dentro del MISMO tipo de tratamiento.
  select * into v_prev_template
  from treatment_phase_templates
  where treatment_type_id = v_template.treatment_type_id
    and phase_kind = 'clinical'
    and sequence_order < v_template.sequence_order
  order by sequence_order desc
  limit 1;

  -- Si es la primera fase clínica, no hay precondición que validar.
  if v_prev_template.id is null then
    return new;
  end if;

  -- Suma de cool-downs de las fases 'lab_wait' que quedan ENTRE ambas clínicas.
  select coalesce(sum(cooldown_days), 0) into v_required_cd
  from treatment_phase_templates
  where treatment_type_id = v_template.treatment_type_id
    and phase_kind = 'lab_wait'
    and sequence_order > v_prev_template.sequence_order
    and sequence_order < v_template.sequence_order;

  -- La fase clínica previa debe estar ya agendada para ESTA instancia.
  select * into v_prev_appt
  from appointments
  where treatment_id = new.treatment_id
    and phase_template_id = v_prev_template.id
    and status not in ('cancelled', 'no_show')
    and deleted_at is null
  order by start_at desc
  limit 1;

  if v_prev_appt.id is null then
    raise exception
      'No se puede agendar la fase "%" sin la fase previa "%" del tratamiento %.',
      v_template.name, v_prev_template.name, new.treatment_id
      using errcode = 'check_violation';
  end if;

  -- Cumplimiento del cool-down (Regla 1).
  if new.start_at < v_prev_appt.end_at + make_interval(days => v_required_cd) then
    raise exception
      'La fase "%" no puede iniciar antes de % (cool-down de % días).',
      v_template.name,
      (v_prev_appt.end_at + make_interval(days => v_required_cd)),
      v_required_cd
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger trg_validate_sequence
  before insert or update of start_at, end_at, phase_template_id, treatment_id, status
  on appointments
  for each row execute function validate_treatment_sequence();

-- -----------------------------------------------------------------------------
-- 8. AUDIT LOGS — append-only (Data Compliance / Trazabilidad)
-- -----------------------------------------------------------------------------
create table audit_logs (
  id          bigint generated always as identity primary key,
  clinic_id   uuid,
  table_name  text not null,
  record_id   uuid,
  action      text not null,                   -- INSERT | UPDATE | DELETE
  actor_id    uuid,                            -- staff o, para el Bot, app.actor_id
  actor_role  text,
  source      text,                            -- 'whatsapp_bot' | 'staff' | etc.
  old_data    jsonb,
  new_data    jsonb,
  occurred_at timestamptz not null default now()
);
create index on audit_logs (clinic_id, table_name, record_id);

-- Función de auditoría genérica. Para escrituras del Bot (service_role) el actor
-- se toma de la variable de sesión app.actor_id, que el backend debe fijar con:
--   select set_config('app.actor_id', '<uuid>', true);
--   select set_config('app.source',   'whatsapp_bot', true);
create or replace function audit_trigger()
returns trigger language plpgsql as $$
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

create trigger trg_audit_appointments
  after insert or update or delete on appointments
  for each row execute function audit_trigger();
create trigger trg_audit_treatments
  after insert or update or delete on treatments
  for each row execute function audit_trigger();
create trigger trg_audit_patients
  after insert or update or delete on patients
  for each row execute function audit_trigger();

-- Inmutabilidad: bloquea UPDATE/DELETE sobre el propio log.
create rule audit_logs_no_update as on update to audit_logs do instead nothing;
create rule audit_logs_no_delete as on delete to audit_logs do instead nothing;

-- -----------------------------------------------------------------------------
-- 9. updated_at en tablas mutables
-- -----------------------------------------------------------------------------
create trigger trg_upd_clinics       before update on clinics       for each row execute function set_updated_at();
create trigger trg_upd_staff         before update on staff_members for each row execute function set_updated_at();
create trigger trg_upd_professionals before update on professionals for each row execute function set_updated_at();
create trigger trg_upd_patients      before update on patients      for each row execute function set_updated_at();
create trigger trg_upd_ttypes        before update on treatment_types for each row execute function set_updated_at();
create trigger trg_upd_phases        before update on treatment_phase_templates for each row execute function set_updated_at();
create trigger trg_upd_modifiers     before update on technology_modifiers for each row execute function set_updated_at();
create trigger trg_upd_treatments    before update on treatments    for each row execute function set_updated_at();
create trigger trg_upd_appointments  before update on appointments  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- 10. PERFIL DE RIESGO DEL PACIENTE (Regla 3: no-shows / prime time)
--     security_invoker => respeta el RLS del invocador sobre las tablas base.
-- -----------------------------------------------------------------------------
create view patient_risk_profile
with (security_invoker = on) as
select
  p.id        as patient_id,
  p.clinic_id,
  count(a.*) filter (where a.status = 'no_show')      as no_show_count,
  (count(a.*) filter (where a.status = 'no_show') >= 2) as restrict_prime_time
from patients p
left join appointments a
  on a.patient_id = p.id and a.deleted_at is null
group by p.id, p.clinic_id;

-- -----------------------------------------------------------------------------
-- 11. RLS — AISLAMIENTO MULTI-TENANT + RBAC
--     Política base: cada fila se filtra por clinic_id del JWT.
--     Refinar por rol según necesidad (ejemplo en appointments).
-- -----------------------------------------------------------------------------
alter table clinics                   enable row level security;
alter table staff_members             enable row level security;
alter table professionals             enable row level security;
alter table patients                  enable row level security;
alter table treatment_types           enable row level security;
alter table treatment_phase_templates enable row level security;
alter table technology_modifiers      enable row level security;
alter table treatments                enable row level security;
alter table appointments              enable row level security;
alter table appointment_modifiers     enable row level security;
alter table audit_logs                enable row level security;

-- Macro de política de tenant para tablas con clinic_id directo.
do $$
declare t text;
begin
  foreach t in array array[
    'staff_members','professionals','patients','treatment_types',
    'treatment_phase_templates','technology_modifiers','treatments','appointments'
  ] loop
    execute format($f$
      create policy tenant_all on %1$I
        for all
        using (clinic_id = auth_clinic_id())
        with check (clinic_id = auth_clinic_id());
    $f$, t);
  end loop;
end $$;

create policy tenant_self on clinics
  for all using (id = auth_clinic_id()) with check (id = auth_clinic_id());

-- audit_logs: lectura solo dentro de la clínica; escritura solo vía trigger.
create policy audit_read on audit_logs for select using (clinic_id = auth_clinic_id());

-- Ejemplo de refinamiento RBAC: recepción NO modifica turnos en curso/cerrados.
-- (Se suma a tenant_all; ajustar según política definitiva.)
create policy reception_no_close on appointments
  for update
  using (clinic_id = auth_clinic_id())
  with check (
    auth_role() <> 'reception'
    or status not in ('in_progress','completed')
  );

-- =============================================================================
-- FIN v1
-- =============================================================================
