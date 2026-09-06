"use client";

import { useEffect } from "react";

import { CALENDAR_VIEW_COOKIE, type CalendarView } from "./view-preference";

/**
 * Persiste la vista elegida (Jornada / Semana) en una cookie para que el
 * enlace pelado del menú (`/calendar`) respete la última preferencia en lugar
 * de volver siempre a "Jornada".
 *
 * Es una cookie y no localStorage porque `page.tsx` es un Server Component y
 * necesita leer la preferencia durante el render, sin parpadeo.
 */
export function RememberView({ view }: { view: CalendarView }) {
  useEffect(() => {
    // 1 año, alcance a toda la app, SameSite=Lax: es una preferencia de UI.
    document.cookie = `${CALENDAR_VIEW_COOKIE}=${view}; path=/; max-age=31536000; samesite=lax`;
  }, [view]);

  return null;
}
