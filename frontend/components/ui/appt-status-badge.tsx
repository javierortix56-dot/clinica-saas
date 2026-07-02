import {
  Ban,
  Check,
  CheckCheck,
  Clock,
  Play,
  X,
  type LucideIcon,
} from "lucide-react";

// Badge de estado de turno con ÍCONO además de color: el color solo no alcanza
// para usuarios daltónicos (confirmado/completado y cancelado/ausente comparten
// familia cromática). Server-safe (sin hooks) — usable en RSC y client.

const APPT_STATUS_CHIP: Record<
  string,
  { label: string; bg: string; fg: string; border: string; icon: LucideIcon }
> = {
  proposed: { label: "Propuesto", bg: "#fffbeb", fg: "#b45309", border: "#fde68a", icon: Clock },
  confirmed: { label: "Confirmado", bg: "#ecfdf5", fg: "#047857", border: "#a7f3d0", icon: Check },
  in_progress: { label: "En curso", bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe", icon: Play },
  completed: { label: "Completado", bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe", icon: CheckCheck },
  cancelled: { label: "Cancelado", bg: "#fff1f2", fg: "#be123c", border: "#fecdd3", icon: X },
  no_show: { label: "Ausente", bg: "#fff1f2", fg: "#be123c", border: "#fecdd3", icon: Ban },
};

export function ApptStatusBadge({ status }: { status: string }) {
  const c = APPT_STATUS_CHIP[status];
  if (!c) {
    return (
      <span className="inline-flex items-center gap-[5px] rounded-full border border-slate-200 bg-slate-100 px-[10px] py-[4px] text-[11.5px] font-semibold text-slate-500">
        {status}
      </span>
    );
  }
  const Icon = c.icon;
  return (
    <span
      className="inline-flex items-center gap-[5px] rounded-full border px-[10px] py-[4px] text-[11.5px] font-semibold"
      style={{ background: c.bg, color: c.fg, borderColor: c.border }}
    >
      <Icon className="h-[11px] w-[11px]" strokeWidth={2.5} />
      {c.label}
    </span>
  );
}
