import { IsISO8601, IsUUID } from 'class-validator';

/**
 * Cuerpo de POST /appointments/manual — alta manual de turno por el staff.
 *
 * Las fechas llegan como ISO 8601 CON offset (ej: "2026-06-23T09:00:00-03:00")
 * para que el instante absoluto sea inequívoco. El professional_id y patient_id
 * se validan server-side contra la clínica del JWT (nunca se confía en el body).
 */
export class CreateManualAppointmentDto {
  @IsUUID()
  patientId!: string;

  @IsUUID()
  professionalId!: string;

  @IsISO8601()
  startAt!: string;

  @IsISO8601()
  endAt!: string;
}
