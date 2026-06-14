-- =============================================================================
-- MIGRACIÓN 0003 — Estado conversacional del Bot de WhatsApp (Fase 4)
-- Aditiva sobre 0001 y 0002.
-- =============================================================================
-- Resuelve:
--   * Qué clínica recibe cada mensaje (cada clínica tiene su número de WhatsApp).
--   * Identidad con teléfono compartido: el teléfono es canal; el paciente se
--     resuelve por DNI dentro del flujo (patient_id arranca null).
--   * Contexto para function calling (historial + estado de la conversación).
--   * Idempotencia de webhooks (WhatsApp puede reenviar el mismo mensaje).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. CANAL: número de WhatsApp de la clínica -> clinic_id
--    El webhook entrante trae el phone_number_id de Meta; con esto se enruta.
-- -----------------------------------------------------------------------------
create table whatsapp_channels (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinics(id),
  phone_number_id text not null unique,         -- Phone Number ID de Meta Cloud API
  display_number  text,                         -- +54911... (humano)
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index on whatsapp_channels (clinic_id);

-- -----------------------------------------------------------------------------
-- 2. CONVERSACIÓN (sesión por contacto)
--    patient_id es NULL hasta que el flujo valida el DNI. Si el mismo teléfono
--    abre otra sesión (madre vs hijo), se re-valida identidad por DNI.
-- -----------------------------------------------------------------------------
create table conversations (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinics(id),
  contact_phone   text not null,                -- E.164 del paciente (puede repetirse)
  patient_id      uuid references patients(id), -- se resuelve por DNI en el flujo
  status          text not null default 'active', -- 'active' | 'closed' | 'handed_off'
  current_intent  text,                         -- 'budget' | 'urgency' | 'booking' | ...
  context         jsonb not null default '{}',  -- datos de trabajo: DNI en validación, slots ofrecidos, treatment_id en curso...
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
-- Solo una conversación ACTIVA por (clínica, teléfono).
create unique index uq_active_conversation
  on conversations (clinic_id, contact_phone)
  where status = 'active' and deleted_at is null;
create index on conversations (clinic_id, patient_id);

-- -----------------------------------------------------------------------------
-- 3. MENSAJES (contexto del LLM + auditoría natural del diálogo)
--    Esta tabla ES el log; no se le pone trigger de auditoría adicional.
-- -----------------------------------------------------------------------------
create table conversation_messages (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinics(id),
  conversation_id uuid not null references conversations(id),
  role            text not null,                -- 'user' | 'assistant' | 'tool'
  content         text,
  tool_calls      jsonb,                        -- function calling: llamadas y resultados
  wa_message_id   text,                         -- id del mensaje en WhatsApp
  created_at      timestamptz not null default now()
);
create index on conversation_messages (conversation_id, created_at);
-- Idempotencia: descarta reenvíos del mismo mensaje de WhatsApp.
create unique index uq_wa_message
  on conversation_messages (clinic_id, wa_message_id)
  where wa_message_id is not null;

-- -----------------------------------------------------------------------------
-- 4. RLS + auditoría + updated_at
--    El bot escribe con service_role (bypassa RLS). Las políticas son para que
--    el staff lea las conversaciones desde el panel. Dominio de contacto/agenda:
--    accesible a todo el staff (no es ficha clínica).
-- -----------------------------------------------------------------------------
alter table whatsapp_channels       enable row level security;
alter table conversations           enable row level security;
alter table conversation_messages   enable row level security;

create policy tenant_all on whatsapp_channels
  for all using (clinic_id = auth_clinic_id()) with check (clinic_id = auth_clinic_id());
create policy tenant_all on conversations
  for all using (clinic_id = auth_clinic_id()) with check (clinic_id = auth_clinic_id());
create policy tenant_all on conversation_messages
  for all using (clinic_id = auth_clinic_id()) with check (clinic_id = auth_clinic_id());

-- Audita cambios de estado de la conversación (no cada mensaje).
create trigger trg_audit_conversations after insert or update or delete
  on conversations for each row execute function audit_trigger();

create trigger trg_upd_channels before update on whatsapp_channels
  for each row execute function set_updated_at();
create trigger trg_upd_conversations before update on conversations
  for each row execute function set_updated_at();

-- =============================================================================
-- FIN migración 0003
-- =============================================================================
