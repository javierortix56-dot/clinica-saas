import type { WeeklyAppointment, WeeklyBlock } from "@/lib/supabase/server";

// Helpers puros de fecha/slot para el calendario. Sin secretos ni acceso a datos
// — solo aritmética de fechas. Compartidos entre page.tsx (Server Component, para
// el resumen del día) y CalendarGrid.tsx (Client Component, para la grilla).

const TZ = "America/Argentina/Buenos_Aires";

// ─── Grid constants ───────────────────────────────────────────────────────────

// 08:00 – 19:30 en franjas de 30 min = 24 slots.
export const SLOTS: { hour: number; minute: number }[] = [];
for (let h = 8; h <= 19; h++) {
  SLOTS.push({ hour: h, minute: 0 });
  SLOTS.push({ hour: h, minute: 30 });
}

export const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function getMondayOf(ref: Date): Date {
  const d = new Date(ref);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

// YYYY-MM-DD en hora local del servidor (UTC en producción).
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// Lun–Sáb a partir del lunes de la semana mostrada.
export function getWeekDays(monday: Date): Date[] {
  return Array.from({ length: 6 }, (_, i) => addDays(monday, i));
}

// Reconstruye un YYYY-MM-DD como fecha a medianoche LOCAL (no UTC), para que
// toDateString() en el browser coincida con la fecha de calendario esperada
// sin importar la zona horaria del cliente.
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  });
}

export function formatSlot({
  hour,
  minute,
}: {
  hour: number;
  minute: number;
}): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatDayDate(date: Date): string {
  return date.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "numeric",
    timeZone: TZ,
  });
}

export function formatDuration(startIso: string, endIso: string): string {
  const mins = Math.round(
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000
  );
  return `${mins} min`;
}

// ─── Cell filtering ──────────────────────────────────────────────────────────

// Localiza el start_at en Buenos Aires, lo trunca al slot de 30 min más cercano
// (floor), y compara con la celda (day, hour, minute).
export function appointmentsForSlot(
  appointments: WeeklyAppointment[],
  day: Date,
  hour: number,
  minute: number
): WeeklyAppointment[] {
  return appointments.filter((a) => {
    const localStr = new Date(a.start_at).toLocaleString("en-US", {
      timeZone: TZ,
    });
    const local = new Date(localStr);
    const slottedMinute = Math.floor(local.getMinutes() / 30) * 30;
    return (
      local.getHours() === hour &&
      slottedMinute === minute &&
      local.toDateString() === day.toDateString()
    );
  });
}

// Bloqueos cuyo inicio cae en este slot de 30 min (mismo criterio de floor que
// los turnos). Un bloqueo largo se muestra en su slot de inicio con su duración.
export function blocksForSlot(
  blocks: WeeklyBlock[],
  day: Date,
  hour: number,
  minute: number
): WeeklyBlock[] {
  return blocks.filter((b) => {
    const localStr = new Date(b.start_at).toLocaleString("en-US", {
      timeZone: TZ,
    });
    const local = new Date(localStr);
    const slottedMinute = Math.floor(local.getMinutes() / 30) * 30;
    return (
      local.getHours() === hour &&
      slottedMinute === minute &&
      local.toDateString() === day.toDateString()
    );
  });
}

// ─── Day state ────────────────────────────────────────────────────────────────

export function isToday(date: Date): boolean {
  const today = new Date().toLocaleDateString("es-AR", { timeZone: TZ });
  return date.toLocaleDateString("es-AR", { timeZone: TZ }) === today;
}

export function isSameLocalDay(iso: string, ref: Date): boolean {
  return (
    new Date(iso).toLocaleDateString("es-AR", { timeZone: TZ }) ===
    ref.toLocaleDateString("es-AR", { timeZone: TZ })
  );
}

// ─── Day summary (siempre basado en "hoy", no en la semana mostrada) ──────────

export interface DaySummary {
  todayCount: number;
  remaining: WeeklyAppointment[];
  next: WeeklyAppointment | null;
}

export function buildDaySummary(
  appointments: WeeklyAppointment[],
  now: Date
): DaySummary {
  const todays = appointments.filter((a) => isSameLocalDay(a.start_at, now));
  const remaining = todays.filter((a) => new Date(a.start_at) >= now);
  return { todayCount: todays.length, remaining, next: remaining[0] ?? null };
}
