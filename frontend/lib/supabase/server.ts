import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Appointment, Patient } from "@clinica/shared";

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

// Columnas que seleccionamos de `patients`. La columna real es `national_id`
// (el spec la llamaba `document_id` — usamos el nombre real de la BD).
const PATIENT_SELECT = "id, clinic_id, full_name, phone, national_id, created_at";

function rowToPatient(row: Record<string, unknown>): Patient {
  return {
    id: row.id as string,
    clinic_id: row.clinic_id as string,
    full_name: row.full_name as string,
    phone: (row.phone as string | null) ?? null,
    national_id: row.national_id as string,
    created_at: row.created_at as string,
  };
}

// Lista todos los pacientes de la clínica ordenados por nombre.
// RLS (`tenant_all`) filtra por clinic_id del JWT automáticamente.
export async function getPatients(): Promise<Patient[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("patients")
    .select(PATIENT_SELECT)
    .order("full_name", { ascending: true });

  if (error) {
    throw new Error(`No se pudieron cargar los pacientes: ${error.message}`);
  }

  return ((data ?? []) as Record<string, unknown>[]).map(rowToPatient);
}

// Devuelve un paciente por ID, o null si no existe (o RLS lo oculta).
export async function getPatientById(id: string): Promise<Patient | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("patients")
    .select(PATIENT_SELECT)
    .eq("id", id)
    .single();

  if (error) {
    // PGRST116: no rows — el paciente no existe o RLS lo filtró.
    if (error.code === "PGRST116") return null;
    throw new Error(`No se pudo cargar el paciente: ${error.message}`);
  }

  return data ? rowToPatient(data as Record<string, unknown>) : null;
}
