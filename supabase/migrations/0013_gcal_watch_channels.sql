-- =============================================================================
-- MIGRACIÓN 0013 — Canales de notificación push (watch) de Google Calendar
-- Aditiva sobre 0005/0012.
-- =============================================================================
-- Habilita la sincronización en TIEMPO REAL Google → App. En vez de depender
-- solo del poll cada 10 min, cada profesional conectado registra un "watch
-- channel" sobre su target_calendar_id (el calendario "Turnos - ..."). Google
-- hace un POST a /google-calendar/webhook cada vez que cambia ese calendario
-- (p.ej. el profesional elimina el evento de un turno), y el backend cancela el
-- turno al instante.
--
-- Los canales expiran (Google fija una expiración máxima), por lo que se
-- guardan los datos necesarios para renovarlos y para detenerlos (channels.stop)
-- al desconectar o reemplazar el canal.
-- =============================================================================

alter table professional_calendar_links
  add column if not exists watch_channel_id  text,        -- UUID del canal (lo generamos nosotros)
  add column if not exists watch_resource_id text,        -- id del recurso vigilado (lo da Google; necesario para stop)
  add column if not exists watch_token       text,        -- secreto echeado en X-Goog-Channel-Token (verifica el webhook)
  add column if not exists watch_expiration  timestamptz; -- vencimiento del canal; se renueva antes de expirar

-- Búsqueda del link por canal cuando llega un webhook de Google.
create index if not exists idx_pcl_watch_channel
  on professional_calendar_links (watch_channel_id)
  where watch_channel_id is not null;
