import { redirect } from "next/navigation";

import { createClient, getPatientSession } from "@/lib/supabase/server";
import { CancelButton } from "./CancelButton";

export const dynamic = "force-dynamic";

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; fg: string; border: string; dot: string }
> = {
  proposed: {
    label: "Propuesto",
    bg: "#fffbeb",
    fg: "#b45309",
    border: "#fde68a",
    dot: "#f59e0b",
  },
  confirmed: {
    label: "Confirmado",
    bg: "#ecfdf5",
    fg: "#047857",
    border: "#a7f3d0",
    dot: "#10b981",
  },
  in_progress: {
    label: "En curso",
    bg: "#eff6ff",
    fg: "#1d4ed8",
    border: "#bfdbfe",
    dot: "#3b82f6",
  },
  completed: {
    label: "Completado",
    bg: "#eff6ff",
    fg: "#1d4ed8",
    border: "#bfdbfe",
    dot: "#3b82f6",
  },
  cancelled: {
    label: "Cancelado",
    bg: "#fff1f2",
    fg: "#be123c",
    border: "#fecdd3",
    dot: "#f43f5e",
  },
  no_show: {
    label: "No asistió",
    bg: "#fff1f2",
    fg: "#be123c",
    border: "#fecdd3",
    dot: "#f43f5e",
  },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] ?? {
    label: status,
    bg: "#f1f5f9",
    fg: "#64748b",
    border: "#e2e8f0",
    dot: "#94a3b8",
  };
  return (
    <span
      className="inline-flex shrink-0 items-center gap-[6px] rounded-full border px-[10px] py-[4px] text-[11.5px] font-semibold"
      style={{ background: c.bg, color: c.fg, borderColor: c.border }}
    >
      <span
        className="h-[5px] w-[5px] rounded-full"
        style={{ background: c.dot }}
      />
      {c.label}
    </span>
  );
}

const fullFmt = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
});
const dayFmt = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  timeZone: "America/Argentina/Buenos_Aires",
});
const monthFmt = new Intl.DateTimeFormat("es-AR", {
  month: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});
const timeFmt = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
});

type ApptRow = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  professionals: { staff_members: { full_name: string } | null } | null;
  treatments: { treatment_types: { name: string } | null } | null;
  treatment_phase_templates: { name: string } | null;
};

function labelOf(appt: ApptRow): string | null {
  return (
    appt.treatments?.treatment_types?.name ??
    appt.treatment_phase_templates?.name ??
    null
  );
}

export default async function PortalTurnosPage() {
  const { hasSession, patientId } = await getPatientSession();

  if (!hasSession || !patientId) {
    redirect("/portal/login");
  }

  const supabase = createClient();
  const [{ data, error }, { data: patient }] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        `id, start_at, end_at, status,
         professionals ( staff_members ( full_name ) ),
         treatments ( treatment_types ( name ) ),
         treatment_phase_templates ( name )`
      )
      .eq("patient_id", patientId)
      .order("start_at", { ascending: false }),
    supabase
      .from("patients")
      .select("full_name")
      .eq("id", patientId)
      .maybeSingle(),
  ]);

  if (error) {
    throw new Error(`No se pudieron cargar los turnos: ${error.message}`);
  }

  const appointments = (data ?? []) as unknown as ApptRow[];
  const firstName = (patient?.full_name ?? "").trim().split(/\s+/)[0] || "";
  const now = new Date();

  // Próximo turno: el más cercano en el futuro que esté propuesto o confirmado.
  const upcoming = appointments
    .filter(
      (a) =>
        ["proposed", "confirmed"].includes(a.status) &&
        new Date(a.start_at) > now
    )
    .sort(
      (a, b) =>
        new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );
  const next = upcoming[0] ?? null;

  return (
    <div className="animate-fade-up">
      <h1 className="text-[28px] font-extrabold tracking-[-.02em]">
        Hola{firstName ? `, ${firstName}` : ""}
      </h1>
      <p className="mb-[26px] mt-[11px] text-[15px] font-medium text-muted-foreground">
        Gestioná tus turnos y consultá tus indicaciones.
      </p>

      {/* Hero próximo turno */}
      {next && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-5 rounded-modal bg-gradient-to-br from-[#0e1726] to-[#1e293b] px-7 py-[26px] shadow-[0_12px_32px_rgba(15,23,42,.18)]">
          <div>
            <div className="mb-[14px] inline-flex items-center gap-[7px] rounded-full bg-white/10 px-[11px] py-[5px] text-[11px] font-semibold uppercase tracking-[.06em] text-slate-300">
              <span className="h-[6px] w-[6px] rounded-full bg-emerald-400" />
              Próximo turno
            </div>
            <div className="text-[24px] font-extrabold capitalize leading-tight text-white">
              {fullFmt.format(new Date(next.start_at))}
            </div>
            <div className="mt-[10px] text-[14px] font-medium text-slate-400">
              {[labelOf(next), next.professionals?.staff_members?.full_name]
                .filter(Boolean)
                .join(" · ") || "Turno agendado"}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        {/* Tus turnos */}
        <div className="rounded-[18px] border border-border bg-white px-6 py-[22px] shadow-card-soft">
          <h3 className="mb-[18px] text-[16px] font-bold">Tus turnos</h3>
          {appointments.length === 0 ? (
            <p className="text-[13.5px] font-medium text-muted-foreground">
              No tenés turnos registrados.
            </p>
          ) : (
            <div className="flex flex-col">
              {appointments.map((appt, i) => {
                const start = new Date(appt.start_at);
                const canCancel =
                  ["proposed", "confirmed"].includes(appt.status) &&
                  start > now;
                return (
                  <div key={appt.id}>
                    {i > 0 && <div className="h-px bg-slate-100" />}
                    <div className="flex items-center gap-[14px] py-[14px]">
                      <div className="w-12 shrink-0 rounded-[11px] bg-slate-50 py-[7px] text-center">
                        <div className="text-[17px] font-extrabold leading-none text-slate-600">
                          {dayFmt.format(start)}
                        </div>
                        <div className="mt-[3px] text-[10px] font-semibold uppercase leading-none text-slate-400">
                          {monthFmt.format(start).replace(".", "")}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-bold text-foreground">
                          {labelOf(appt) ?? "Turno"}
                        </div>
                        <div className="mt-[5px] text-[12.5px] font-medium text-muted-foreground">
                          {timeFmt.format(start)}
                          {appt.professionals?.staff_members?.full_name
                            ? ` · ${appt.professionals.staff_members.full_name}`
                            : ""}
                        </div>
                        {canCancel && (
                          <div className="mt-2">
                            <CancelButton appointmentId={appt.id} />
                          </div>
                        )}
                      </div>
                      <StatusBadge status={appt.status} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Side */}
        <div className="flex flex-col gap-5">
          <div className="rounded-[18px] bg-primary p-[22px] shadow-[0_8px_22px_rgba(37,99,235,.3)]">
            <div className="text-[16px] font-bold leading-tight text-white">
              ¿Necesitás un turno?
            </div>
            <div className="mt-2 text-[13px] font-medium leading-[1.4] text-white/85">
              Comunicate con la clínica para coordinar tu próxima consulta.
            </div>
          </div>
          <div className="rounded-[18px] border border-border bg-white px-[22px] py-5 shadow-card-soft">
            <h3 className="mb-[14px] text-[15px] font-bold">
              Indicaciones vigentes
            </h3>
            <div className="text-[13px] font-medium leading-[1.55] text-slate-600">
              Seguí las indicaciones de tu profesional. Ante cualquier molestia,
              contactá a la clínica.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
