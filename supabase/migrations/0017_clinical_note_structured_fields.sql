-- =============================================================================
-- 0017 — Campos clínicos estructurados (configurables por profesional)
-- =============================================================================
-- La nota clínica pasa de ser solo texto libre a soportar campos estructurados:
-- motivo de consulta, signos vitales, diagnóstico e indicaciones. Cada profesional
-- decide cuáles ve en su formulario (un odontólogo y un endocrinólogo usan
-- conjuntos distintos), por eso la configuración vive en `professionals`.
--
-- Además, alergias y antecedentes son datos a NIVEL PACIENTE (persisten en toda
-- la historia, no por nota). Se guardan en una tabla aparte con RLS clínica dura
-- (solo admin/doctor) para NO filtrarlos a recepción vía la tabla patients.
--
-- Diseño de datos:
--   • clinical_notes.structured_data  jsonb  → { motivo, vitals:{...}, diagnostico, indicaciones }
--   • professionals.note_field_config jsonb  → { motivo, vitals, diagnostico, indicaciones, alergias } (bool)
--                                              ausente/{} = todos activos por defecto.
--   • patient_clinical_profile (tabla)       → alergias + antecedentes por paciente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Datos estructurados por nota (motivo / vitals / diagnóstico / indicaciones)
-- -----------------------------------------------------------------------------
alter table clinical_notes
  add column if not exists structured_data jsonb not null default '{}'::jsonb;

-- -----------------------------------------------------------------------------
-- 2. Configuración de campos por profesional
--    {} = todos activos (el frontend trata las claves ausentes como true).
-- -----------------------------------------------------------------------------
alter table professionals
  add column if not exists note_field_config jsonb not null default '{}'::jsonb;

-- -----------------------------------------------------------------------------
-- 3. Perfil clínico del paciente (alergias + antecedentes)
--    Tabla separada de `patients` para respetar el borde duro: recepción NO debe
--    ver datos clínicos. RLS idéntica a clinical_notes (solo admin/doctor).
-- -----------------------------------------------------------------------------
create table if not exists patient_clinical_profile (
  patient_id      uuid primary key references patients(id) on delete cascade,
  clinic_id       uuid not null references clinics(id),
  allergies       text,
  medical_history text,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references professionals(id)
);
create index if not exists idx_patient_clinical_profile_clinic
  on patient_clinical_profile (clinic_id);

alter table patient_clinical_profile enable row level security;

-- Solo admin/doctor de la misma clínica. Recepción no recibe política -> sin acceso.
drop policy if exists clinical_admin_doctor on patient_clinical_profile;
create policy clinical_admin_doctor on patient_clinical_profile
  for all
  using  (clinic_id = auth_clinic_id() and auth_role() in ('admin','doctor'))
  with check (clinic_id = auth_clinic_id() and auth_role() in ('admin','doctor'));

-- updated_at automático (misma función que el resto de tablas).
drop trigger if exists trg_upd_patient_clinical_profile on patient_clinical_profile;
create trigger trg_upd_patient_clinical_profile before update on patient_clinical_profile
  for each row execute function set_updated_at();

-- Auditoría (misma función security-definer que clinical_notes).
drop trigger if exists trg_audit_patient_clinical_profile on patient_clinical_profile;
create trigger trg_audit_patient_clinical_profile
  after insert or update or delete on patient_clinical_profile
  for each row execute function audit_trigger();

-- -----------------------------------------------------------------------------
-- 4. El bot (clinic_bot) NO debe tocar datos clínicos. Revocamos por las dudas.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'clinic_bot') then
    revoke all on patient_clinical_profile from clinic_bot;
  end if;
end $$;
