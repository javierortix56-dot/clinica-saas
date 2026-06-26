import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user.interface';
import {
  AppointmentsService,
  ConfirmAppointmentResult,
} from './appointments.service';
import { CreateManualAppointmentDto } from './dto/create-manual-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';

/**
 * Endpoints de escritura de turnos para el staff. Protegidos por JWT de
 * Supabase (SupabaseJwtGuard) + autorización por rol (RolesGuard). Los writes
 * de turnos pasan SIEMPRE por acá (nunca directo a Supabase desde el frontend).
 */
@Controller('appointments')
@UseGuards(SupabaseJwtGuard, RolesGuard)
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  /**
   * Confirma un turno propuesto. Admin, reception y doctor. Idempotente.
   */
  @Post(':id/confirm')
  @HttpCode(200)
  @Roles('admin', 'reception', 'doctor')
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ConfirmAppointmentResult> {
    return this.appointments.confirm(id, user);
  }

  /**
   * Cancela un turno. Admin, reception y doctor. Idempotente. Elimina el evento
   * espejo del Google Calendar del profesional si estaba sincronizado.
   */
  @Post(':id/cancel')
  @HttpCode(200)
  @Roles('admin', 'reception', 'doctor')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ConfirmAppointmentResult> {
    return this.appointments.cancel(id, user);
  }

  /**
   * Alta manual de turno (recepción/admin). Inserta como confirmado y sincroniza
   * con Google Calendar. Reemplaza el INSERT directo a Supabase del frontend.
   */
  /**
   * Actualiza el estado de un turno (in_progress, completed, no_show).
   * Admin, reception y doctor pueden marcar la evolución del turno.
   */
  @Patch(':id/status')
  @HttpCode(200)
  @Roles('admin', 'reception', 'doctor')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: UpdateAppointmentStatusDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ConfirmAppointmentResult> {
    return this.appointments.updateStatus(id, dto.status, user);
  }

  /**
   * Reprograma un turno (confirmed/proposed): actualiza start_at y end_at,
   * mantiene el estado y actualiza el evento de Google Calendar.
   */
  @Patch(':id/reschedule')
  @HttpCode(200)
  @Roles('admin', 'reception', 'doctor')
  reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: RescheduleAppointmentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ConfirmAppointmentResult> {
    return this.appointments.reschedule(id, dto, user);
  }

  @Post('manual')
  @HttpCode(201)
  @Roles('admin', 'reception', 'doctor')
  createManual(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: CreateManualAppointmentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ConfirmAppointmentResult> {
    return this.appointments.createManual(dto, user);
  }
}
