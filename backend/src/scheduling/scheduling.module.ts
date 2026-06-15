import { Module } from '@nestjs/common';
import { SchedulingService } from './scheduling.service';
import { ProponerTurnosHandler } from './handlers/proponer-turnos.handler';
import { AgendarTurnoHandler } from './handlers/agendar-turno.handler';
import { IniciarTratamientoHandler } from './handlers/iniciar-tratamiento.handler';

/**
 * SchedulingModule — `SchedulingService` (helpers de agenda, `slot_is_available`,
 * cool-down, prime time) + handlers `proponer_turnos`, `agendar_turno`,
 * `iniciar_tratamiento`. Los turnos se crean siempre en estado `proposed`.
 * Exporta los handlers para que `AiModule` arme el registro `TOOL_HANDLERS`.
 */
@Module({
  providers: [
    SchedulingService,
    ProponerTurnosHandler,
    AgendarTurnoHandler,
    IniciarTratamientoHandler,
  ],
  exports: [
    ProponerTurnosHandler,
    AgendarTurnoHandler,
    IniciarTratamientoHandler,
  ],
})
export class SchedulingModule {}
