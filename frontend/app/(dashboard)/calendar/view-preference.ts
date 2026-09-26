// Preferencia de vista del calendario, compartida entre el Server Component
// que la lee de la cookie y el Client Component que la escribe.

export const CALENDAR_VIEW_COOKIE = "calendar_view";

export type CalendarView = "day" | "week";

export function parseCalendarView(value: string | undefined | null): CalendarView | null {
  return value === "week" || value === "day" ? value : null;
}

// Profesional elegido en el selector de la agenda (admin/recepción). Mismo
// criterio que la vista: cookie para que el enlace del menú lo respete.
export const CALENDAR_PROF_COOKIE = "calendar_prof";
export const ALL_PROFESSIONALS = "all";
