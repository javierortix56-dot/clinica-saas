-- =============================================================================
-- MIGRACIÓN 0008 — Agregar columna email a patients
-- =============================================================================
-- Nullable: los pacientes existentes no tienen email. El staff lo carga desde
-- el panel admin (o via bot de WhatsApp en Phase 16).
-- Sin unique constraint global: dos clínicas distintas pueden tener el mismo
-- email para distintos pacientes (el aislamiento lo provee el tenant).
-- =============================================================================

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS email text;

-- FIN migración 0008
