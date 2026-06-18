export type StaffRole = 'admin' | 'professional' | 'reception';

export type AppointmentStatus =
  | 'proposed'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no_show';

export interface Patient {
  id: string;
  clinic_id: string;
  national_id: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  created_at: string;
}

export interface Appointment {
  id: string;
  clinic_id: string;
  patient_id: string;
  professional_id: string;
  treatment_id?: string | null;
  phase_template_id?: string | null;
  // Etiqueta del tratamiento para mostrar en UI. No es una columna de
  // `appointments`: se deriva del join treatments -> treatment_types.name
  // (o, en su defecto, del nombre de la fase). Opcional porque sólo se
  // completa en lecturas con join (ej. la bandeja de aprobaciones).
  treatment_type?: string | null;
  start_at: string; // ISO-8601
  end_at: string; // ISO-8601
  status: AppointmentStatus;
  origin?: string;
  created_at: string;
  // Relaciones opcionales para lecturas con join.
  // Nota: el nombre del profesional vive en `staff_members.full_name`
  // (professionals -> staff_members), no en `professionals`.
  patient?: { full_name: string; phone: string | null };
  professional?: { full_name: string };
}
