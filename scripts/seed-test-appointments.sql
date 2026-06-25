-- =============================================================================
-- SEED DATA: 5 turnos/día × 14 días para doctor@test.com
-- =============================================================================
-- Prerequisitos:
--   1. Haber ejecutado seed-test-users.sql (crea staff_members + professionals).
--   2. Que existan pacientes en la clínica (al menos 1, idealmente 5+).
--
-- Cómo ejecutar:
--   Supabase Dashboard → SQL Editor → pegar y ejecutar.
--   Corre como postgres (service_role) → RLS bypasseada.
--
-- Franjas horarias (ART = UTC − 3):
--   09:00-09:45 | 10:30-11:15 | 12:00-12:45 | 14:00-14:45 | 15:30-16:15
--   Todas en horario de oficina, fuera del prime time (17:00-20:00 ART).
--
-- Estados generados (sin 'cancelled'):
--   proposed · confirmed · in_progress · completed · no_show
--   Se rotan con offset por día para que cada día muestre variedad.
--
-- origin = 'staff' → bypassa el trigger de disponibilidad (migración 0011).
-- =============================================================================

DO $$
DECLARE
  v_clinic_id       uuid := '791f2ec3-f0b9-4a60-92fb-330ea52433aa';
  v_professional_id uuid;
  v_patient_ids     uuid[];
  v_patient_count   int;

  v_days            int  := 14;
  v_base_date       date := '2026-06-24';

  -- Slots en UTC (ART + 3h). Duración 45 min cada uno.
  v_starts text[] := ARRAY[
    '12:00:00+00',  -- 09:00 ART
    '13:30:00+00',  -- 10:30 ART
    '15:00:00+00',  -- 12:00 ART
    '17:00:00+00',  -- 14:00 ART
    '18:30:00+00'   -- 15:30 ART
  ];
  v_ends text[] := ARRAY[
    '12:45:00+00',  -- 09:45 ART
    '14:15:00+00',  -- 11:15 ART
    '15:45:00+00',  -- 12:45 ART
    '17:45:00+00',  -- 14:45 ART
    '19:15:00+00'   -- 16:15 ART
  ];

  -- Todos los estados excepto 'cancelled'.
  v_statuses text[] := ARRAY[
    'proposed', 'confirmed', 'in_progress', 'completed', 'no_show'
  ];

  v_day     int;
  v_slot    int;
  v_total   int := 0;
  v_date    date;
  v_start   timestamptz;
  v_end     timestamptz;
  v_status  appointment_status;
  v_patient uuid;
BEGIN

  -- ── 1. Resolver professional_id desde email ────────────────────────────────
  SELECT p.id INTO v_professional_id
  FROM professionals p
  JOIN staff_members s ON s.id = p.staff_member_id
  WHERE s.email    = 'doctor@test.com'
    AND s.clinic_id = v_clinic_id
    AND s.is_active = true
    AND s.deleted_at IS NULL
  LIMIT 1;

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION
      'doctor@test.com no tiene fila en professionals. '
      'Verificá que seed-test-users.sql se haya ejecutado correctamente.';
  END IF;

  RAISE NOTICE 'Professional ID: %', v_professional_id;

  -- ── 2. Obtener hasta 5 pacientes de la clínica ─────────────────────────────
  SELECT ARRAY_AGG(id ORDER BY created_at)
  INTO   v_patient_ids
  FROM (
    SELECT id, created_at
    FROM   patients
    WHERE  clinic_id   = v_clinic_id
      AND  deleted_at IS NULL
    LIMIT 5
  ) sub;

  v_patient_count := COALESCE(ARRAY_LENGTH(v_patient_ids, 1), 0);

  IF v_patient_count = 0 THEN
    RAISE EXCEPTION
      'No hay pacientes en la clínica. '
      'Cargá al menos un paciente antes de ejecutar este script.';
  END IF;

  RAISE NOTICE 'Pacientes encontrados: %', v_patient_count;

  -- ── 3. Generar turnos ──────────────────────────────────────────────────────
  FOR v_day IN 0..(v_days - 1) LOOP
    v_date := v_base_date + v_day;

    FOR v_slot IN 1..5 LOOP

      v_start := (v_date::text || 'T' || v_starts[v_slot])::timestamptz;
      v_end   := (v_date::text || 'T' || v_ends[v_slot])::timestamptz;

      -- Estado: rotamos con offset = v_day para que cada día empiece en uno distinto.
      -- Día 0: proposed·confirmed·in_progress·completed·no_show
      -- Día 1: confirmed·in_progress·completed·no_show·proposed
      -- Día 2: in_progress·completed·no_show·proposed·confirmed  ... etc.
      v_status := v_statuses[((v_day + v_slot - 1) % 5) + 1]::appointment_status;

      -- Paciente: rotamos por todos los disponibles.
      v_patient := v_patient_ids[((v_day * 5 + v_slot - 1) % v_patient_count) + 1];

      INSERT INTO appointments (
        clinic_id,
        patient_id,
        professional_id,
        start_at,
        end_at,
        status,
        origin
      ) VALUES (
        v_clinic_id,
        v_patient,
        v_professional_id,
        v_start,
        v_end,
        v_status,
        'staff'   -- bypassa trigger de disponibilidad (migración 0011)
      );

      v_total := v_total + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Listo. Insertados % turnos de prueba (% días × 5 slots).', v_total, v_days;

END $$;

-- =============================================================================
-- VERIFICACIÓN (ejecutar después):
-- =============================================================================
-- SELECT
--   to_char(start_at AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD HH24:MI') AS fecha_art,
--   status,
--   p.full_name AS paciente
-- FROM appointments a
-- JOIN patients p ON p.id = a.patient_id
-- WHERE a.clinic_id = '791f2ec3-f0b9-4a60-92fb-330ea52433aa'
--   AND a.deleted_at IS NULL
-- ORDER BY a.start_at;
