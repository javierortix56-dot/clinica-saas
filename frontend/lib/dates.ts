// Fechas de calendario ("YYYY-MM-DD") en la zona de la clínica. El servidor corre
// en UTC: toda cuenta de días se hace sobre strings/UTC para no correr un día.

export const CLINIC_TZ = "America/Argentina/Buenos_Aires";

const isoFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CLINIC_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CLINIC_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(s: string | null | undefined): s is string {
  return !!s && ISO_DATE_RE.test(s) && !isNaN(Date.parse(`${s}T00:00:00Z`));
}

// Fecha de calendario de un instante, vista desde la clínica.
export function dateISOInTZ(instant: Date | string): string {
  return isoFormatter.format(typeof instant === "string" ? new Date(instant) : instant);
}

export function todayISO(): string {
  return dateISOInTZ(new Date());
}

function toUTCDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function fromUTCDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, days: number): string {
  const d = toUTCDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUTCDate(d);
}

// 1 = lunes … 7 = domingo.
export function weekdayOfISO(iso: string): number {
  const day = toUTCDate(iso).getUTCDay();
  return day === 0 ? 7 : day;
}

export function mondayOfISO(iso: string): string {
  return addDaysISO(iso, 1 - weekdayOfISO(iso));
}

// Instante UTC en que empieza ese día en la zona de la clínica.
export function startOfDayInTZ(iso: string): Date {
  const guess = toUTCDate(iso);
  const p = Object.fromEntries(
    partsFormatter.formatToParts(guess).map((x) => [x.type, x.value])
  );
  const asLocal = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second)
  );
  return new Date(guess.getTime() - (asLocal - guess.getTime()));
}

// Formatea una fecha de calendario sin que la zona horaria la desplace.
export function formatISODate(
  iso: string,
  options: Intl.DateTimeFormatOptions
): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-AR", {
    ...options,
    timeZone: "UTC",
  });
}
