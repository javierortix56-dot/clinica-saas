-- Migration 0011: Staff-created appointments bypass availability check
--
-- When origin = 'staff', the receptionist/admin is manually scheduling an
-- appointment (possibly outside normal hours or for a professional with no
-- availability configured). In that case, the availability constraint should
-- not block the insert — the staff member is consciously overriding the schedule.
--
-- origin = 'whatsapp' (bot-proposed) still enforces availability normally.

create or replace function enforce_availability()
returns trigger language plpgsql as $$
begin
  -- Cancelled/no_show rows don't represent real slots.
  if new.status in ('cancelled', 'no_show') then
    return new;
  end if;

  -- Staff-created appointments bypass availability: the receptionist or admin
  -- is manually coordinating with the professional.
  if new.origin = 'staff' then
    return new;
  end if;

  if not slot_is_available(new.professional_id, new.start_at, new.end_at) then
    raise exception
      'El profesional no tiene disponibilidad para el rango % – %.',
      new.start_at, new.end_at
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
