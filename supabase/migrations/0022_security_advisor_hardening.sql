-- Migration 0022: hardening según el advisor de seguridad de Supabase (jul 2026)
-- Ver docs/auditoria_general_2026-07.md §2.4.

-- -----------------------------------------------------------------------------
-- 1) search_path fijo en funciones usadas por RLS y triggers (lint 0011).
--    Con search_path mutable, un rol puede interponer objetos homónimos en un
--    schema propio y desviar la resolución de nombres dentro de la función.
--    Se fija a `public` (los cuerpos referencian tablas de public sin calificar
--    y llaman a auth.jwt() ya calificado).
-- -----------------------------------------------------------------------------
alter function public.auth_clinic_id() set search_path = public;
alter function public.auth_role() set search_path = public;
alter function public.auth_is_owner() set search_path = public;
alter function public.set_updated_at() set search_path = public;
alter function public.validate_treatment_sequence() set search_path = public;
alter function public.slot_is_available(uuid, timestamptz, timestamptz) set search_path = public;
alter function public.enforce_prime_time_restriction() set search_path = public;
alter function public.enforce_availability() set search_path = public;

-- -----------------------------------------------------------------------------
-- 2) audit_trigger() es SECURITY DEFINER y era ejecutable vía
--    /rest/v1/rpc/audit_trigger por anon y authenticated (lints 0028/0029).
--    Solo la invocan los triggers de auditoría: el chequeo de EXECUTE se hace
--    al CREAR el trigger (owner), no al dispararse, así que revocar no rompe
--    la auditoría de INSERT/UPDATE/DELETE existente.
-- -----------------------------------------------------------------------------
revoke execute on function public.audit_trigger() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3) appointment_modifiers tiene RLS habilitado sin policies (lint 0008).
--    Es INTENCIONAL: la tabla la usa solo el backend (rol clinic_bot vía
--    Prisma, grants en la 0006). Deny-all vía API para anon/authenticated.
--    Se documenta para que el próximo lector no lo tome por un olvido.
-- -----------------------------------------------------------------------------
comment on table public.appointment_modifiers is
  'Sin policies RLS a propósito: acceso exclusivo del backend (rol clinic_bot via Prisma, migración 0006). Deny-all para anon/authenticated por la API.';

-- -----------------------------------------------------------------------------
-- 4) btree_gist estaba instalada en public (lint 0014). Es relocatable; los
--    índices/constraints EXCLUDE existentes referencian los operadores por OID,
--    así que moverla de schema no los afecta.
-- -----------------------------------------------------------------------------
create schema if not exists extensions;
alter extension btree_gist set schema extensions;

-- NOTA (manual, fuera de SQL): activar "Leaked password protection" en
-- Dashboard → Authentication → Providers → Email (chequeo HaveIBeenPwned).
