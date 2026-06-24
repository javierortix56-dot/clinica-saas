-- =============================================================================
-- 0015 — Adjuntos de notas clínicas (imágenes / PDFs) con Storage privado
-- =============================================================================
-- Permite adjuntar radiografías, fotos clínicas y PDFs de laboratorio a cada
-- nota de la historia clínica. Los binarios viven en un bucket PRIVADO de
-- Supabase Storage; esta tabla guarda solo metadatos + la ruta del objeto.
--
-- Seguridad (espejo de clinical_notes, migración 0002 §6/§7):
--   - RLS: SOLO admin/doctor, aislado por clinic_id (recepción sin acceso).
--   - Borde duro §6: el rol clinic_bot NUNCA accede a adjuntos clínicos.
--   - Storage: cada objeto vive bajo el prefijo `{clinic_id}/...`; las policies
--     del bucket restringen lectura/escritura a la clínica dueña y a admin/doctor.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabla de metadatos
-- -----------------------------------------------------------------------------
create table if not exists clinical_note_attachments (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references clinics(id),
  clinical_note_id uuid not null references clinical_notes(id) on delete cascade,
  storage_path     text not null,          -- ruta del objeto en el bucket
  file_name        text not null,          -- nombre original (para mostrar/descargar)
  mime_type        text not null,          -- image/png, image/jpeg, application/pdf, ...
  size_bytes       bigint not null,
  uploaded_by      uuid references professionals(id),
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index if not exists idx_cna_note
  on clinical_note_attachments (clinical_note_id)
  where deleted_at is null;

-- -----------------------------------------------------------------------------
-- 2. RLS — espejo exacto de clinical_notes (solo admin/doctor, por clínica)
-- -----------------------------------------------------------------------------
alter table clinical_note_attachments enable row level security;

create policy cna_admin_doctor on clinical_note_attachments
  for all
  using  (clinic_id = auth_clinic_id() and auth_role() in ('admin','doctor'))
  with check (clinic_id = auth_clinic_id() and auth_role() in ('admin','doctor'));

-- Auditoría append-only (mismo trigger genérico que el resto de la ficha).
create trigger trg_audit_cna after insert or update or delete
  on clinical_note_attachments for each row execute function audit_trigger();

-- -----------------------------------------------------------------------------
-- 3. Borde duro §6 — el bot jamás toca adjuntos clínicos
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'clinic_bot') then
    revoke all on clinical_note_attachments from clinic_bot;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 4. Bucket privado de Storage + policies por clínica
-- -----------------------------------------------------------------------------
-- Bucket NO público: el acceso pasa siempre por signed URLs generadas server-side.
insert into storage.buckets (id, name, public)
values ('clinical-attachments', 'clinical-attachments', false)
on conflict (id) do nothing;

-- Convención de ruta: `{clinic_id}/{clinical_note_id}/{uuid}-{filename}`.
-- (storage.foldername(name))[1] = primer segmento = clinic_id de la clínica dueña.
-- Cada acción (select/insert/update/delete) verifica que ese prefijo coincida con
-- la clínica del JWT y que el rol sea admin/doctor — idéntico a clinical_notes.

create policy "clinical_attachments_select" on storage.objects
  for select
  using (
    bucket_id = 'clinical-attachments'
    and (storage.foldername(name))[1] = auth_clinic_id()::text
    and auth_role() in ('admin','doctor')
  );

create policy "clinical_attachments_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'clinical-attachments'
    and (storage.foldername(name))[1] = auth_clinic_id()::text
    and auth_role() in ('admin','doctor')
  );

create policy "clinical_attachments_update" on storage.objects
  for update
  using (
    bucket_id = 'clinical-attachments'
    and (storage.foldername(name))[1] = auth_clinic_id()::text
    and auth_role() in ('admin','doctor')
  );

create policy "clinical_attachments_delete" on storage.objects
  for delete
  using (
    bucket_id = 'clinical-attachments'
    and (storage.foldername(name))[1] = auth_clinic_id()::text
    and auth_role() in ('admin','doctor')
  );
