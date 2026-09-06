-- Configuración del consultorio de un único profesional.
alter table public.clinics
  add column if not exists contact_phone text,
  add column if not exists address text,
  add column if not exists default_appointment_minutes integer not null default 30,
  add column if not exists auto_confirm_requests boolean not null default false;

alter table public.clinics
  drop constraint if exists clinics_default_appointment_minutes_check;

alter table public.clinics
  add constraint clinics_default_appointment_minutes_check
  check (default_appointment_minutes between 10 and 240);

comment on column public.clinics.auto_confirm_requests is
  'Confirma automáticamente solicitudes válidas creadas por el asistente de WhatsApp.';
