import type { WeeklyAppointment } from "@/lib/supabase/server";
import { formatISODate } from "@/lib/dates";
import { whatsappLink } from "@/lib/whatsapp";
import { formatMinutes } from "./agenda-model";

// Estilos por estado, compartidos por las vistas Día, Semana y Resumen.
// Clases literales (Tailwind las detecta al compilar).
export const STATUS_STYLE: Record<
  WeeklyAppointment["status"],
  { card: string; title: string; sub: string; label: string }
> = {
  confirmed: {
    card: "border border-emerald-200 bg-emerald-50",
    title: "text-emerald-950",
    sub: "text-emerald-800",
    label: "Confirmado",
  },
  in_progress: {
    card: "border border-blue-300 bg-blue-50",
    title: "text-blue-950",
    sub: "text-blue-800",
    label: "En consulta",
  },
  completed: {
    card: "border border-slate-200 bg-slate-50",
    title: "text-slate-700",
    sub: "text-slate-500",
    label: "Atendido",
  },
  no_show: {
    card: "border border-rose-200 bg-rose-50",
    title: "text-rose-950",
    sub: "text-rose-800",
    label: "No asistió",
  },
  proposed: {
    card: "border-[1.5px] border-dashed border-orange-400 bg-orange-50",
    title: "text-orange-950",
    sub: "text-orange-800",
    label: "Por confirmar",
  },
};

export const BLOCK_STYLE = {
  card: "border border-slate-200 bg-slate-100",
  title: "text-slate-700",
  sub: "text-slate-600",
};

export const FREE_STYLE = "border-[1.5px] border-dashed border-slate-300 bg-white text-blue-700 hover:border-blue-400 hover:bg-blue-50";

export function calcAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T12:00:00`);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : null;
}

// "martes, 29 de septiembre" → "Martes, 29 de septiembre".
export function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

// WhatsApp con un saludo sobre el turno, desde el teléfono de quien lo abre.
export function appointmentWhatsapp(a: WeeklyAppointment, dateISO: string, startMin: number): string | null {
  const day = formatISODate(dateISO, { weekday: "long", day: "2-digit", month: "2-digit" });
  return whatsappLink(
    a.patient_phone,
    `Hola ${firstName(a.patient_name)}, te escribimos del consultorio por tu turno del ${day} a las ${formatMinutes(startMin)}.`
  );
}

export function blockLabel(source: string): string {
  return source === "google_calendar" ? "Google Calendar" : "Bloqueo";
}
