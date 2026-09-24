import type { WeeklyAppointment, WeeklyBlock } from "@/lib/supabase/server";
import { CLINIC_TZ, dateISOInTZ, todayISO } from "@/lib/dates";

// Helpers puros de fecha/slot para el calendario. Sin secretos ni acceso a datos
// — solo aritmética de fechas. Compartidos entre page.tsx (Server Component, para
// el resumen del día) y CalendarGrid.tsx (Client Component, para la grilla).

export const TZ = CLINIC_TZ;

// ─── Grid constants ───────────────────────────────────────────────────────────

// 08:00 – 19:30 en franjas de 30 min = 24 slots.
export const SLOTS: { hour: number; minute: number }[] = [];
for (let h = 8; h <= 19; h++) {
  SLOTS.push({ hour: h, minute: 0 });
  SLOTS.push({ hour: h, minute: 30 });
}

export const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

// YYYY-MM-DD de una fecha construida con parseISODate (medianoche local).
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
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

// `date` es una fecha de calendario (medianoche local): se formatea sin zona.
export function formatDayDate(date: Date): string {
  return date.toLocaleDateString("es-AR", { day: "numeric", month: "numeric" });
}

export function formatDuration(startIso: string, endIso: string): string {
  const mins = Math.round(
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000
  );
  return `${mins} min`;
}

// ─── Grid placement helpers (desktop) ────────────────────────────────────────

// Índice 0-based en SLOTS para un ISO timestamp dado.
// Devuelve -1 si está fuera del rango visible (antes de 08:00 o después de 19:30).
export function getSlotIndex(isoStart: string): number {
  const local = new Date(
    new Date(isoStart).toLocaleString("en-US", { timeZone: TZ })
  );
  const h = local.getHours();
  const m = Math.floor(local.getMinutes() / 30) * 30;
  const firstHour = SLOTS[0].hour;
  const idx = (h - firstHour) * 2 + (m === 30 ? 1 : 0);
  if (idx < 0 || idx >= SLOTS.length) return -1;
  return idx;
}

// Número de franjas de 30 min que ocupa el turno (mínimo 1).
export function getSlotSpan(startIso: string, endIso: string): number {
  const mins = Math.round(
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000
  );
  return Math.max(1, Math.ceil(mins / 30));
}

// "HH:MM:SS" o "HH:MM" → minutos desde medianoche.
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

// Índice 0-based del día en la semana. Devuelve -1 si no corresponde a ningún día visible.
export function getDayIndex(isoStart: string, weekDays: Date[]): number {
  const day = dateISOInTZ(isoStart);
  return weekDays.findIndex((d) => toISODate(d) === day);
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
  return toISODate(date) === todayISO();
}

// ¿El instante `iso` cae en el día de calendario `ref` (medianoche local)?
export function isSameLocalDay(iso: string, ref: Date): boolean {
  return dateISOInTZ(iso) === toISODate(ref);
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
  const today = dateISOInTZ(now);
  const todays = appointments.filter((a) => dateISOInTZ(a.start_at) === today);
  const remaining = todays.filter((a) => new Date(a.start_at) >= now);
  return { todayCount: todays.length, remaining, next: remaining[0] ?? null };
}
