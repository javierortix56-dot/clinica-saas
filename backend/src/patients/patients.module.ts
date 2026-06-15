import { Module } from '@nestjs/common';
import { BuscarPacienteHandler } from './handlers/buscar-paciente.handler';
import { RegistrarPacienteHandler } from './handlers/registrar-paciente.handler';
import { ConsultarHistorialHandler } from './handlers/consultar-historial.handler';

/**
 * PatientsModule — handlers de tools de pacientes: `buscar_paciente_por_dni`,
 * `registrar_paciente`, `consultar_historial_paciente` (resumen seguro).
 * Exporta los handlers para que `AiModule` arme el registro `TOOL_HANDLERS`.
 */
@Module({
  providers: [
    BuscarPacienteHandler,
    RegistrarPacienteHandler,
    ConsultarHistorialHandler,
  ],
  exports: [
    BuscarPacienteHandler,
    RegistrarPacienteHandler,
    ConsultarHistorialHandler,
  ],
})
export class PatientsModule {}
