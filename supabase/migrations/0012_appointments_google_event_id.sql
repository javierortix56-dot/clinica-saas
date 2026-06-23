-- Migration 0012: google_event_id en appointments
--
-- Guarda el ID del evento en Google Calendar para poder hacer update/delete
-- cuando el turno cambia de estado. NULL = aún no sincronizado.
alter table appointments add column if not exists google_event_id text;
