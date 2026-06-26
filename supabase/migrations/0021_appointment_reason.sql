-- Agrega motivo de consulta a los turnos.
-- Campo texto libre opcional; se muestra en la tarjeta del calendario y en el
-- detalle del turno. Lo puede cargar el staff al crear un turno manual, o el
-- bot de WhatsApp al parsear el mensaje del paciente.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reason text;
