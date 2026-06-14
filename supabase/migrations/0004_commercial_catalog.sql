-- =============================================================================
-- MIGRACIÓN 0004 — Catálogo comercial: precios por rango + tarifa de valoración
-- Aditiva sobre 0001-0003.
-- =============================================================================
-- Modelo:
--   * Cada clínica define su MONEDA y su tarifa de VALORACIÓN ($X de la 1ra visita).
--   * Cada tipo de tratamiento define un RANGO de precio ($A–$B) que el bot cotiza.
--   * Los montos usan numeric(12,2): NUNCA float para dinero (errores de redondeo).
--   * Los cambios de precio quedan auditados (audit_logs) para trazabilidad.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Moneda + tarifa de valoración a nivel clínica
-- -----------------------------------------------------------------------------
alter table clinics
  add column currency      text not null default 'ARS',   -- código ISO 4217
  add column valuation_fee numeric(12,2);                  -- el $X (consulta de valoración)

-- -----------------------------------------------------------------------------
-- 2. Rango de precio por tipo de tratamiento (el $A–$B del flujo de WhatsApp)
--    Nullable: un tratamiento puede existir sin precio cargado todavía.
-- -----------------------------------------------------------------------------
alter table treatment_types
  add column price_min numeric(12,2),
  add column price_max numeric(12,2),
  add constraint chk_price_range
    check (
      price_min is null or price_max is null or price_max >= price_min
    );

-- -----------------------------------------------------------------------------
-- 3. Trazabilidad: auditar altas/cambios/bajas del catálogo y sus precios.
--    (En 0001 no se había puesto audit a treatment_types; el precio lo exige.)
-- -----------------------------------------------------------------------------
create trigger trg_audit_treatment_types after insert or update or delete
  on treatment_types for each row execute function audit_trigger();

-- =============================================================================
-- FIN migración 0004
-- =============================================================================
