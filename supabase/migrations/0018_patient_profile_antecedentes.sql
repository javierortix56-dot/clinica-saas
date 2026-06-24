-- Agrega antecedentes familiares al perfil clínico del paciente.
-- Los antecedentes personales ya estaban en medical_history; se agrega el
-- campo familiar para completar la anamnesis estructurada.
alter table patient_clinical_profile
  add column if not exists antecedentes_familiares text;
