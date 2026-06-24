-- =============================================================================
-- 0014 — Recordatorios de turnos por WhatsApp.
--
-- Marca de tiempo de cada recordatorio enviado (24h antes y 4h antes) para
-- garantizar idempotencia: el cron que envía recordatorios filtra por estas
-- columnas en NULL, así nunca manda dos veces el mismo recordatorio aunque el
-- cron corra cada 15 min o se reintente.
-- =============================================================================

alter table appointments
  add column if not exists reminder_24h_sent_at timestamptz,
  add column if not exists reminder_4h_sent_at  timestamptz;

-- Índice parcial para que el cron encuentre rápido los turnos confirmados
-- pendientes de recordatorio, sin escanear toda la tabla.
create index if not exists idx_appointments_reminders_pending
  on appointments (start_at)
  where status = 'confirmed'
    and deleted_at is null
    and (reminder_24h_sent_at is null or reminder_4h_sent_at is null);
