-- Migration 0023: hardening según el advisor de PERFORMANCE de Supabase (jul 2026)
-- (el advisor falló en la auditoría de julio; re-corrido en esta segunda pasada)
--
-- 1) Todas las policies RLS estaban creadas sin cláusula TO → aplican a PUBLIC,
--    o sea que también se evalúan para `anon` en cada request de PostgREST
--    (lint 0006 multiple_permissive_policies para anon). Ningún flujo usa anon:
--    el staff y los pacientes del portal son `authenticated`, y el bot usa el
--    rol `clinic_bot` (BYPASSRLS, migración 0006). Scopear a `authenticated`
--    elimina esa evaluación inútil y reduce superficie.
--
-- 2) FKs sin índice de cobertura (lint 0001): afecta joins y los chequeos de
--    integridad al borrar/actualizar la fila referenciada.
--
-- Queda como backlog documentado (NO se toca acá): consolidar los pares de
-- policies permisivas para `authenticated` (p. ej. cfg_select + cfg_write_owner
-- FOR ALL) separando las de escritura en INSERT/UPDATE/DELETE, para que los
-- SELECT evalúen una sola policy.

-- -----------------------------------------------------------------------------
-- 1. Policies → TO authenticated
-- -----------------------------------------------------------------------------
alter policy patient_view_own       on public.appointments               to authenticated;
alter policy reception_no_close     on public.appointments               to authenticated;
alter policy tenant_all             on public.appointments               to authenticated;
alter policy audit_read             on public.audit_logs                 to authenticated;
alter policy tenant_all             on public.availability_exceptions    to authenticated;
alter policy admin_write            on public.clinic_specialties         to authenticated;
alter policy tenant_read            on public.clinic_specialties         to authenticated;
alter policy admin_write            on public.clinic_specialty_fields    to authenticated;
alter policy tenant_read            on public.clinic_specialty_fields    to authenticated;
alter policy cna_admin_doctor       on public.clinical_note_attachments  to authenticated;
alter policy clinical_admin_doctor  on public.clinical_notes             to authenticated;
alter policy clinic_select          on public.clinics                    to authenticated;
alter policy clinic_write_owner     on public.clinics                    to authenticated;
alter policy tenant_all             on public.conversation_messages      to authenticated;
alter policy tenant_all             on public.conversations              to authenticated;
alter policy clinical_admin_doctor  on public.patient_clinical_profile   to authenticated;
alter policy patient_view_self      on public.patients                   to authenticated;
alter policy tenant_all             on public.patients                   to authenticated;
alter policy tenant_all             on public.professional_availability  to authenticated;
alter policy tenant_all             on public.professional_calendar_links to authenticated;
alter policy tenant_all             on public.professionals              to authenticated;
alter policy staff_select           on public.staff_members              to authenticated;
alter policy staff_write_owner      on public.staff_members              to authenticated;
alter policy cfg_select             on public.technology_modifiers       to authenticated;
alter policy cfg_write_owner        on public.technology_modifiers       to authenticated;
alter policy cfg_select             on public.treatment_phase_templates  to authenticated;
alter policy cfg_write_owner        on public.treatment_phase_templates  to authenticated;
alter policy cfg_select             on public.treatment_types            to authenticated;
alter policy cfg_write_owner        on public.treatment_types            to authenticated;
alter policy tenant_all             on public.treatments                 to authenticated;
alter policy tenant_all             on public.whatsapp_channels          to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Índices de cobertura para FKs (lint 0001)
-- -----------------------------------------------------------------------------
create index if not exists idx_am_technology_modifier
  on public.appointment_modifiers (technology_modifier_id);
create index if not exists idx_appointments_phase_template
  on public.appointments (phase_template_id);
create index if not exists idx_ae_clinic
  on public.availability_exceptions (clinic_id);
create index if not exists idx_cna_clinic
  on public.clinical_note_attachments (clinic_id);
create index if not exists idx_cna_uploaded_by
  on public.clinical_note_attachments (uploaded_by);
create index if not exists idx_cn_author
  on public.clinical_notes (author_id);
create index if not exists idx_cn_patient
  on public.clinical_notes (patient_id);
create index if not exists idx_cn_treatment
  on public.clinical_notes (treatment_id);
create index if not exists idx_conversations_patient
  on public.conversations (patient_id);
create index if not exists idx_pcp_updated_by
  on public.patient_clinical_profile (updated_by);
create index if not exists idx_pa_clinic
  on public.professional_availability (clinic_id);
create index if not exists idx_tpt_clinic
  on public.treatment_phase_templates (clinic_id);
create index if not exists idx_treatments_primary_professional
  on public.treatments (primary_professional_id);
create index if not exists idx_treatments_treatment_type
  on public.treatments (treatment_type_id);
