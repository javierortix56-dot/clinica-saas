import {
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
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
   * Confirma un turno propuesto. Solo admin y reception. Idempotente.
   */
  @Post(':id/confirm')
  @HttpCode(200)
  @Roles('admin', 'reception')
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ConfirmAppointmentResult> {
    return this.appointments.confirm(id, user);
  }
}
