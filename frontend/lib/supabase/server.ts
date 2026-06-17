import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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

// Estado de autenticación del request: si hay sesión y qué rol trae el JWT.
// El claim `user_role` lo inyecta el Custom Access Token Hook (admin | doctor |
// reception; "professional" es el alias histórico de doctor).
export async function getSessionAuth(): Promise<{
  hasSession: boolean;
  role: string | null;
}> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { hasSession: false, role: null };

  let role: string | null = null;
  try {
    const payload = session.access_token.split(".")[1];
    role =
      (
        JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as {
          user_role?: string;
        }
      ).user_role ?? null;
  } catch {
    role = null;
  }
  return { hasSession: true, role };
}

// True si el rol corresponde a un profesional (doctor / professional).
export function isDoctorRole(role: string | null): boolean {
  return role === "doctor" || role === "professional";
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

// Tipo local para la vista de calendario — específico de esta vista, no en @clinica/shared.
export interface WeeklyAppointment {
  id: string;
  start_at: string;
  end_at: string;
  patient_name: string;
  treatment_label: string | null;
}

function getWeekBounds(ref: Date = new Date()): { weekStart: Date; weekEnd: Date } {
  const day = ref.getDay(); // 0=dom … 6=sáb
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(ref);
  monday.setDate(ref.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { weekStart: monday, weekEnd: sunday };
}

// Lee los turnos `confirmed` del profesional logueado para la semana de `refDate` (default: hoy).
// El professional_id se resuelve server-side desde el JWT (sub → staff_members → professionals).
// Devuelve [] si el usuario no tiene fila en `professionals` (sin error — mostrar estado vacío).
export async function getWeeklyAppointments(refDate?: Date): Promise<WeeklyAppointment[]> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Resolver professional_id desde auth_user_id vía join interno.
  const { data: prof } = await supabase
    .from("professionals")
    .select("id, staff_members!inner(auth_user_id)")
    .eq("staff_members.auth_user_id", user.id)
    .single();

  if (!prof) return [];

  const { weekStart, weekEnd } = getWeekBounds(refDate);

  const { data, error } = await supabase
    .from("appointments")
    .select(
      `
        id, start_at, end_at,
        patients ( full_name ),
        treatments ( treatment_types ( name ) ),
        treatment_phase_templates ( name )
      `
    )
    .eq("professional_id", prof.id)
    .eq("status", "confirmed")
    .gte("start_at", weekStart.toISOString())
    .lte("start_at", weekEnd.toISOString())
    .order("start_at", { ascending: true });

  if (error) {
    throw new Error(`No se pudieron cargar los turnos: ${error.message}`);
  }

  type ApptRow = {
    id: string;
    start_at: string;
    end_at: string;
    patients: { full_name: string } | null;
    treatments: { treatment_types: { name: string } | null } | null;
    treatment_phase_templates: { name: string } | null;
  };

  return ((data ?? []) as unknown as ApptRow[]).map((row) => ({
    id: row.id,
    start_at: row.start_at,
    end_at: row.end_at,
    patient_name: row.patients?.full_name ?? "Paciente",
    treatment_label:
      row.treatments?.treatment_types?.name ??
      row.treatment_phase_templates?.name ??
      null,
  }));
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

// ─── Staff / Profesionales ─────────────────────────────────────────────────────

export interface StaffMember {
  id: string;
  full_name: string;
  role: "admin" | "doctor" | "reception";
  email: string | null;
  is_active: boolean;
  professional_id: string | null;
  license_number: string | null;
  // weekday 1=Lun … 6=Sáb; time como "HH:MM:SS"
  availability: { weekday: number; start_time: string; end_time: string }[];
}

interface StaffRow {
  id: string;
  full_name: string;
  role: StaffMember["role"];
  email: string | null;
  is_active: boolean;
  professionals: {
    id: string;
    license_number: string | null;
    professional_availability: {
      weekday: number;
      start_time: string;
      end_time: string;
    }[];
  } | null;
}

// Lista todos los staff members de la clínica con sus horarios de disponibilidad.
// RLS (`tenant_all`) filtra por clinic_id del JWT automáticamente.
export async function getStaffMembers(): Promise<StaffMember[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("staff_members")
    .select(
      `
        id, full_name, role, email, is_active,
        professionals (
          id, license_number,
          professional_availability ( weekday, start_time, end_time )
        )
      `
    )
    .is("deleted_at", null)
    .order("full_name", { ascending: true });

  if (error) {
    throw new Error(`No se pudo cargar el staff: ${error.message}`);
  }

  return ((data ?? []) as unknown as StaffRow[]).map((row) => ({
    id: row.id,
    full_name: row.full_name,
    role: row.role,
    email: row.email,
    is_active: row.is_active,
    professional_id: row.professionals?.id ?? null,
    license_number: row.professionals?.license_number ?? null,
    availability: (row.professionals?.professional_availability ?? []).sort(
      (a, b) => a.weekday - b.weekday
    ),
  }));
}
