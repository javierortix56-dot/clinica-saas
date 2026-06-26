import { IsISO8601 } from 'class-validator';

/**
 * Cuerpo de PATCH /appointments/:id/reschedule — reprogramación de un turno
 * por el staff. Las fechas llegan como ISO 8601 CON offset para que el instante
 * absoluto sea inequívoco (ej: "2026-07-01T10:00:00-03:00").
 */
export class RescheduleAppointmentDto {
  @IsISO8601()
  startAt!: string;

  @IsISO8601()
  endAt!: string;
}
