import { redirect } from "next/navigation";

import { createClient, getPatientSession } from "@/lib/supabase/server";
import { CancelButton } from "./CancelButton";

export const dynamic = "force-dynamic";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  proposed:    { label: "Propuesto",   className: "bg-amber-100 text-amber-700" },
  confirmed:   { label: "Confirmado",  className: "bg-emerald-100 text-emerald-700" },
  in_progress: { label: "En curso",    className: "bg-blue-100 text-blue-700" },
  completed:   { label: "Completado",  className: "bg-slate-100 text-slate-500" },
  cancelled:   { label: "Cancelado",   className: "bg-slate-100 text-slate-400" },
  no_show:     { label: "No asistió",  className: "bg-red-100 text-red-600" },
};

function StatusBadge({ status }: { status: string }) {
  const { label, className } =
    STATUS_CONFIG[status] ?? { label: status, className: "bg-slate-100 text-slate-500" };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(iso));
}

type ApptRow = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  professionals: { staff_members: { full_name: string } | null } | null;
  treatments: { treatment_types: { name: string } | null } | null;
  treatment_phase_templates: { name: string } | null;
};

export default async function PortalTurnosPage() {
  const { hasSession, patientId } = await getPatientSession();

  if (!hasSession || !patientId) {
    redirect("/portal/login");
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(
      `id, start_at, end_at, status,
       professionals ( staff_members ( full_name ) ),
       treatments ( treatment_types ( name ) ),
       treatment_phase_templates ( name )`
    )
    .eq("patient_id", patientId)
    .order("start_at", { ascending: false });

  if (error) {
    throw new Error(`No se pudieron cargar los turnos: ${error.message}`);
  }

  const appointments = (data ?? []) as unknown as ApptRow[];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Mis turnos</h2>
      {appointments.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          No tenés turnos registrados.
        </p>
      ) : (
        <ul className="space-y-3">
          {appointments.map((appt) => {
            const treatmentLabel =
              appt.treatments?.treatment_types?.name ??
              appt.treatment_phase_templates?.name ??
              null;
            const professionalName =
              appt.professionals?.staff_members?.full_name ?? null;

            return (
              <li
                key={appt.id}
                className="rounded-lg border border-slate-200 bg-white p-4 space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">
                    {formatDateTime(appt.start_at)}
                  </p>
                  <StatusBadge status={appt.status} />
                </div>
                {professionalName && (
                  <p className="text-sm text-slate-600">{professionalName}</p>
                )}
                {treatmentLabel && (
                  <p className="text-xs text-slate-500">{treatmentLabel}</p>
                )}
                {["proposed", "confirmed"].includes(appt.status) &&
                  new Date(appt.start_at) > new Date() && (
                    <CancelButton appointmentId={appt.id} />
                  )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
