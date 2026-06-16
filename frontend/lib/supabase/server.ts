import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Appointment } from "@clinica/shared";

// Cliente Supabase para Server Components y Route Handlers.
// Persiste la sesión vía cookies (requerido por @supabase/ssr en Next.js App Router).
export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

// Forma cruda de cada fila devuelta por el select con joins de PostgREST.
// El nombre del profesional vive en staff_members (professionals -> staff_members),
// y la etiqueta del tratamiento se deriva de treatments -> treatment_types.name.
interface ProposedRow {
  id: string;
  clinic_id: string;
  treatment_id: string | null;
  phase_template_id: string | null;
  patient_id: string;
  professional_id: string;
  start_at: string;
  end_at: string;
  status: Appointment["status"];
  origin: string | null;
  created_at: string;
  patients: { full_name: string; phone: string | null } | null;
  professionals: { staff_members: { full_name: string } | null } | null;
  treatments: { treatment_types: { name: string } | null } | null;
  treatment_phase_templates: { name: string } | null;
}

// Lee los turnos en estado `proposed` de la clínica del usuario.
// RLS (`tenant_all`) filtra por clinic_id del JWT automáticamente.
export async function getProposedAppointments(): Promise<Appointment[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("appointments")
    .select(
      `
        id, clinic_id, treatment_id, phase_template_id, patient_id, professional_id,
        start_at, end_at, status, origin, created_at,
        patients ( full_name, phone ),
        professionals ( staff_members ( full_name ) ),
        treatments ( treatment_types ( name ) ),
        treatment_phase_templates ( name )
      `
    )
    .eq("status", "proposed")
    .order("start_at", { ascending: true });

  if (error) {
    throw new Error(`No se pudieron cargar los turnos: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as ProposedRow[];

  return rows.map((row) => ({
    id: row.id,
    clinic_id: row.clinic_id,
    treatment_id: row.treatment_id,
    phase_template_id: row.phase_template_id,
    patient_id: row.patient_id,
    professional_id: row.professional_id,
    treatment_type:
      row.treatments?.treatment_types?.name ??
      row.treatment_phase_templates?.name ??
      null,
    start_at: row.start_at,
    end_at: row.end_at,
    status: row.status,
    origin: row.origin ?? undefined,
    created_at: row.created_at,
    patient: row.patients
      ? { full_name: row.patients.full_name, phone: row.patients.phone }
      : undefined,
    professional: row.professionals?.staff_members
      ? { full_name: row.professionals.staff_members.full_name }
      : undefined,
  }));
}
