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
  created_at: string;
}

export interface Appointment {
  id: string;
  clinic_id: string;
  patient_id: string;
  professional_id: string;
  phase_template_id?: string | null;
  start_at: string;
  end_at: string;
  status: AppointmentStatus;
  created_at: string;
}
