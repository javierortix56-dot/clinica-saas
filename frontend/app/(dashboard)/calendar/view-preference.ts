// Preferencia de vista del calendario, compartida entre el Server Component
// que la lee de la cookie y el Client Component que la escribe.

export const CALENDAR_VIEW_COOKIE = "calendar_view";

export type CalendarView = "day" | "week";

export function parseCalendarView(value: string | undefined | null): CalendarView | null {
  return value === "week" || value === "day" ? value : null;
}
