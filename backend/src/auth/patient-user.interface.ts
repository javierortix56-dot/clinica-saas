/**
 * Contexto autenticado de un paciente del portal, derivado del JWT de Supabase
 * ya verificado. A diferencia del staff, el JWT del paciente NO trae `clinic_id`
 * ni `user_role`; trae el claim `patient_id` que inyecta el custom access token
 * hook (migración 0009). El aislamiento se hace filtrando por `patientId`.
 */
export interface PatientUser {
  /** `sub` del JWT — UUID del usuario en Supabase Auth. Actor de auditoría. */
  userId: string;
  /** `patient_id` inyectado por el hook. Identifica al paciente dueño del turno. */
  patientId: string;
}
