import type { AvailabilityWindow, WeeklyAppointment, WeeklyBlock } from "@/lib/supabase/server";
import { CLINIC_TZ, dateISOInTZ, weekdayOfISO } from "@/lib/dates";

// Modelo de la agenda: arma, para cada día de la semana, la lista ordenada de
// actividades (turnos, solicitudes, bloqueos) y los huecos libres dentro del
// horario de atención. Puro y sin React: lo usan las tres vistas.

export interface Interval {
  startMin: number; // minutos desde medianoche, hora de la clínica
  endMin: number;
}

export type AgendaEntry =
  | ({ kind: "appointment"; key: string; appointment: WeeklyAppointment } & Interval)
  | ({ kind: "block"; key: string; block: WeeklyBlock } & Interval)
  | ({ kind: "free"; key: string } & Interval);

export interface DayModel {
  dateISO: string;
  windows: Interval[]; // horario de atención del día (fusionado)
  entries: AgendaEntry[]; // ordenadas por inicio; incluye huecos si corresponde
  hasAttention: boolean; // tiene horario o alguna actividad
  confirmedCount: number; // confirmados, en curso y atendidos
  pendingCount: number; // solicitudes por confirmar
  availableMinutes: number;
  busyMinutes: number; // ocupado dentro del horario (turnos, solicitudes, bloqueos)
  freeMinutes: number;
  // Minutos ocupados dentro del horario, por tipo (barra de ocupación).
  busyByKind: { confirmed: number; pending: number; block: number };
}

// Estados que se muestran en la agenda. Cancelados no; las solicitudes
// vencidas tampoco (se gestionan en Solicitudes).
export const AGENDA_STATUSES = ["proposed", "confirmed", "in_progress", "completed", "no_show"] as const;

const hmFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: CLINIC_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function minutesInTZ(instant: Date | string): number {
  const [h, m] = hmFormatter
    .format(typeof instant === "string" ? new Date(instant) : instant)
    .split(":")
    .map(Number);
  return h * 60 + m;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function formatMinutes(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

// "1 h", "1,5 h", "45 min".
export function formatHours(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.round((min / 60) * 10) / 10;
  return `${String(h).replace(".", ",")} h`;
}

function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].sort((a, b) => a.startMin - b.startMin);
  const out: Interval[] = [];
  for (const it of sorted) {
    const last = out[out.length - 1];
    if (last && it.startMin <= last.endMin) last.endMin = Math.max(last.endMin, it.endMin);
    else out.push({ ...it });
  }
  return out;
}

function subtract(windows: Interval[], busy: Interval[]): Interval[] {
  let free = windows.map((w) => ({ ...w }));
  for (const b of mergeIntervals(busy)) {
    free = free.flatMap((f) => {
      if (b.endMin <= f.startMin || b.startMin >= f.endMin) return [f];
      const parts: Interval[] = [];
      if (b.startMin > f.startMin) parts.push({ startMin: f.startMin, endMin: b.startMin });
      if (b.endMin < f.endMin) parts.push({ startMin: b.endMin, endMin: f.endMin });
      return parts;
    });
  }
  return free;
}

function overlapMinutes(a: Interval[], b: Interval[]): number {
  let total = 0;
  for (const x of a) {
    for (const y of mergeIntervals(b)) {
      total += Math.max(0, Math.min(x.endMin, y.endMin) - Math.max(x.startMin, y.startMin));
    }
  }
  return total;
}

// Intervalo de un instante ISO dentro del día `dateISO` (recorta lo que cae en
// otro día, p. ej. un evento de Google de varios días). null si no lo toca.
function clipToDay(startIso: string, endIso: string, dateISO: string): Interval | null {
  const startDay = dateISOInTZ(startIso);
  const endDay = dateISOInTZ(endIso);
  if (startDay > dateISO || endDay < dateISO) return null;
  const startMin = startDay < dateISO ? 0 : minutesInTZ(startIso);
  const endMin = endDay > dateISO ? 24 * 60 : minutesInTZ(endIso);
  if (endMin <= startMin && !(endDay > dateISO)) return null;
  return { startMin, endMin: Math.max(endMin, startMin + 1) };
}

export function buildWeekModel({
  days,
  appointments,
  blocks,
  availability,
  now,
  slotMinutes,
  showFree,
}: {
  days: string[]; // YYYY-MM-DD, lunes a sábado
  appointments: WeeklyAppointment[];
  blocks: WeeklyBlock[];
  availability: AvailabilityWindow[];
  now: Date;
  slotMinutes: number;
  // Huecos libres solo con un único profesional a la vista: con varios, el
  // horario combinado no dice quién está libre.
  showFree: boolean;
}): DayModel[] {
  const todayISO = dateISOInTZ(now);
  const nowMin = minutesInTZ(now);
  const nowMs = now.getTime();

  return days.map((dateISO) => {
    const weekday = weekdayOfISO(dateISO);
    const windows = mergeIntervals(
      availability
        .filter((w) => w.weekday === weekday)
        .map((w) => ({ startMin: timeToMinutes(w.start_time), endMin: timeToMinutes(w.end_time) }))
        .filter((w) => w.endMin > w.startMin)
    );

    const entries: AgendaEntry[] = [];
    for (const a of appointments) {
      if (dateISOInTZ(a.start_at) !== dateISO) continue;
      // Solicitud cuyo horario ya pasó: vencida, no ocupa la agenda.
      if (a.status === "proposed" && new Date(a.start_at).getTime() < nowMs) continue;
      const it = clipToDay(a.start_at, a.end_at, dateISO);
      if (it) entries.push({ kind: "appointment", key: a.id, appointment: a, ...it });
    }
    for (const b of blocks) {
      const it = clipToDay(b.start_at, b.end_at, dateISO);
      if (it) entries.push({ kind: "block", key: b.id, block: b, ...it });
    }

    const busy: Interval[] = entries.map((e) => ({ startMin: e.startMin, endMin: e.endMin }));
    const availableMinutes = windows.reduce((t, w) => t + (w.endMin - w.startMin), 0);
    const busyMinutes = overlapMinutes(windows, busy);

    let freeMinutes = 0;
    if (dateISO >= todayISO) {
      let open = subtract(windows, busy);
      if (dateISO === todayISO) {
        // Hoy: lo libre empieza en el próximo múltiplo del turno desde ahora.
        const from = Math.ceil(nowMin / slotMinutes) * slotMinutes;
        open = open
          .map((f) => ({ startMin: Math.max(f.startMin, from), endMin: f.endMin }))
          .filter((f) => f.endMin > f.startMin);
      }
      open = open.filter((f) => f.endMin - f.startMin >= slotMinutes);
      freeMinutes = open.reduce((t, f) => t + (f.endMin - f.startMin), 0);
      if (showFree) {
        for (const f of open) entries.push({ kind: "free", key: `free-${dateISO}-${f.startMin}`, ...f });
      }
    }

    entries.sort((x, y) => x.startMin - y.startMin || x.endMin - y.endMin);

    const appts = entries.filter((e): e is Extract<AgendaEntry, { kind: "appointment" }> => e.kind === "appointment");
    const spans = (list: AgendaEntry[]) => list.map((e) => ({ startMin: e.startMin, endMin: e.endMin }));
    return {
      dateISO,
      windows,
      entries,
      hasAttention: windows.length > 0 || entries.some((e) => e.kind !== "free"),
      confirmedCount: appts.filter((e) => e.appointment.status !== "proposed").length,
      pendingCount: appts.filter((e) => e.appointment.status === "proposed").length,
      availableMinutes,
      busyMinutes,
      freeMinutes,
      busyByKind: {
        confirmed: overlapMinutes(windows, spans(appts.filter((e) => e.appointment.status !== "proposed"))),
        pending: overlapMinutes(windows, spans(appts.filter((e) => e.appointment.status === "proposed"))),
        block: overlapMinutes(windows, spans(entries.filter((e) => e.kind === "block"))),
      },
    };
  });
}

// Rango horario de la grilla semanal: del primer inicio al último fin entre
// horarios y actividades, con media hora de margen. "full" muestra el día
// laboral completo y se estira si algo cae fuera.
export function weekRange(days: DayModel[], mode: "fit" | "full"): Interval {
  let start = mode === "full" ? 7 * 60 : Infinity;
  let end = mode === "full" ? 21 * 60 : -Infinity;
  for (const d of days) {
    for (const w of d.windows) {
      start = Math.min(start, w.startMin);
      end = Math.max(end, w.endMin);
    }
    for (const e of d.entries) {
      if (e.kind === "block" && e.startMin === 0 && e.endMin === 24 * 60) continue; // día completo
      start = Math.min(start, e.startMin);
      end = Math.max(end, e.endMin);
    }
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { startMin: 8 * 60, endMin: 19 * 60 };
  if (mode === "fit") {
    start -= 30;
    end += 30;
  }
  return {
    startMin: Math.max(0, Math.floor(start / 30) * 30),
    endMin: Math.min(24 * 60, Math.ceil(end / 30) * 30),
  };
}

// Columnas para actividades superpuestas (p. ej. varios profesionales a la
// misma hora): cada una recibe su carril y la cantidad de carriles del grupo.
export function layoutLanes<T extends Interval>(items: T[]): (T & { lane: number; lanes: number })[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const out: (T & { lane: number; lanes: number })[] = [];
  let group: (T & { lane: number; lanes: number })[] = [];
  let groupEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...group.map((g) => g.lane + 1));
    for (const g of group) g.lanes = lanes;
    out.push(...group);
    group = [];
  };
  for (const it of sorted) {
    if (group.length && it.startMin >= groupEnd) flush();
    const laneEnds: number[] = [];
    for (const g of group) laneEnds[g.lane] = Math.max(laneEnds[g.lane] ?? -1, g.endMin);
    let lane = laneEnds.findIndex((end) => end <= it.startMin);
    if (lane < 0) lane = laneEnds.length;
    group.push({ ...it, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, it.endMin);
  }
  if (group.length) flush();
  return out;
}
