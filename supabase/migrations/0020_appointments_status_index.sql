-- Índice compuesto para queries que filtran por status (badge de aprobaciones,
-- bandeja de aprobaciones, grilla semanal). Sin este índice el planner usaba
-- el índice de clinic_id y filtraba status en memoria, costoso a escala.
create index if not exists idx_appointments_clinic_status_start
  on appointments (clinic_id, status, start_at)
  where deleted_at is null;
