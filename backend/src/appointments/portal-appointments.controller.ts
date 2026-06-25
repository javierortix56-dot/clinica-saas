import {
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SupabasePatientGuard } from '../auth/supabase-patient.guard';
import { CurrentPatient } from '../auth/current-patient.decorator';
import type { PatientUser } from '../auth/patient-user.interface';
import {
  AppointmentsService,
  ConfirmAppointmentResult,
} from './appointments.service';

/**
 * Endpoints de turnos para el portal del paciente. Protegidos por el JWT de
 * Supabase del paciente (SupabasePatientGuard, exige claim patient_id). Los
 * writes de turnos pasan SIEMPRE por acá (nunca directo a Supabase desde el
 * frontend del portal).
 */
@Controller('portal/appointments')
@UseGuards(SupabasePatientGuard)
export class PortalAppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  /**
   * Cancela un turno propio del paciente. Idempotente. Elimina el evento espejo
   * del Google Calendar del profesional si estaba sincronizado.
   */
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPatient() patient: PatientUser,
  ): Promise<ConfirmAppointmentResult> {
    return this.appointments.cancelByPatient(id, patient);
  }
}
