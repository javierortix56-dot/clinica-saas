import { ToolDeclaration } from '../llm/llm-client.interface';

/**
 * Las 8 herramientas que ve el modelo (blueprint §4).
 *
 * Regla transversal: `clinic_id` y el actor NO aparecen en estas firmas. El
 * executor los inyecta del contexto (§1). El modelo solo declara lo que necesita
 * pedir. Las firmas (nombre, descripción, params) son DEFINITIVAS aunque la
 * lógica sea stub en este paso: es lo que el modelo aprende a llamar.
 */

/** Nombres canónicos, tipados, para evitar strings sueltos por el código. */
export const ToolName = {
  BuscarPacientePorDni: 'buscar_paciente_por_dni',
  ConsultarCatalogo: 'consultar_catalogo',
  ConsultarPoliticasClinica: 'consultar_politicas_clinica',
  ConsultarHistorialPaciente: 'consultar_historial_paciente',
  ProponerTurnos: 'proponer_turnos',
  RegistrarPaciente: 'registrar_paciente',
  IniciarTratamiento: 'iniciar_tratamiento',
  AgendarTurno: 'agendar_turno',
} as const;

export type ToolName = (typeof ToolName)[keyof typeof ToolName];

/**
 * Tools de ESCRITURA (blueprint §1, §5): secuenciales, máx. 1 efectiva por
 * ronda, con guard de idempotencia. El resto son de lectura (idempotentes,
 * paralelizables).
 */
export const WRITE_TOOLS: ReadonlySet<string> = new Set<string>([
  ToolName.RegistrarPaciente,
  ToolName.IniciarTratamiento,
  ToolName.AgendarTurno,
]);

export function isWriteTool(name: string): boolean {
  return WRITE_TOOLS.has(name);
}

export function isReadTool(name: string): boolean {
  return !WRITE_TOOLS.has(name);
}

export const TOOL_DECLARATIONS: ToolDeclaration[] = [
  {
    name: ToolName.BuscarPacientePorDni,
    description:
      'Busca un paciente por su DNI dentro de la clínica. Devuelve el match si ' +
      'existe, o indica que no existe (lo que gatilla el flujo de paciente nuevo).',
    parameters: {
      type: 'object',
      properties: {
        dni: { type: 'string', description: 'DNI del paciente, sin puntos.' },
      },
      required: ['dni'],
    },
  },
  {
    name: ToolName.ConsultarCatalogo,
    description:
      'Consulta el catálogo de tratamientos de la clínica: rango de precios ' +
      'orientativo y tarifa de valoración. Si se omite el tipo, devuelve un ' +
      'resumen general.',
    parameters: {
      type: 'object',
      properties: {
        treatment_type: {
          type: 'string',
          description:
            'Tipo de tratamiento a consultar (p.ej. "ortodoncia", "implante"). ' +
            'Opcional.',
        },
      },
    },
  },
  {
    name: ToolName.ConsultarPoliticasClinica,
    description:
      'Consulta las políticas configurables de la clínica (puntualidad, ' +
      'ausencias, precios, valoración). Si se omite el tema, devuelve todas.',
    parameters: {
      type: 'object',
      properties: {
        tema: {
          type: 'string',
          enum: ['puntualidad', 'no_show', 'precios', 'valoracion'],
          description: 'Tema de política a consultar. Opcional.',
        },
      },
    },
  },
  {
    name: ToolName.ConsultarHistorialPaciente,
    description:
      'Devuelve un RESUMEN SEGURO del historial del paciente: lista de ' +
      'tratamientos, fechas, profesional asignado y estado de fase. NUNCA ' +
      'incluye notas clínicas (clinical_notes están fuera del alcance del bot). ' +
      'Útil para priorizar urgencias o personalizar la atención.',
    parameters: {
      type: 'object',
      properties: {
        patient_id: {
          type: 'string',
          description: 'Id del paciente cuyo resumen se solicita.',
        },
      },
      required: ['patient_id'],
    },
  },
  {
    name: ToolName.ProponerTurnos,
    description:
      'Propone franjas horarias disponibles para un tratamiento. Aplica ' +
      'cool-down entre fases, prime time por historial de ausencias y ' +
      'disponibilidad estricta del profesional. No agenda nada: solo propone.',
    parameters: {
      type: 'object',
      properties: {
        treatment_type: {
          type: 'string',
          description: 'Tipo de tratamiento del turno a proponer.',
        },
        fase: {
          type: 'string',
          description: 'Fase del tratamiento, si aplica. Opcional.',
        },
        desde: {
          type: 'string',
          description: 'Fecha/hora ISO-8601 mínima a considerar. Opcional.',
        },
        hasta: {
          type: 'string',
          description: 'Fecha/hora ISO-8601 máxima a considerar. Opcional.',
        },
      },
      required: ['treatment_type'],
    },
  },
  {
    name: ToolName.RegistrarPaciente,
    description:
      'Registra un paciente nuevo en la clínica. Usar solo tras confirmar con ' +
      'buscar_paciente_por_dni que no existe.',
    parameters: {
      type: 'object',
      properties: {
        dni: { type: 'string', description: 'DNI del paciente, sin puntos.' },
        nombre: { type: 'string', description: 'Nombre del paciente.' },
        apellido: { type: 'string', description: 'Apellido del paciente.' },
        telefono: {
          type: 'string',
          description: 'Teléfono de contacto (E.164). Opcional.',
        },
      },
      required: ['dni', 'nombre', 'apellido'],
    },
  },
  {
    name: ToolName.IniciarTratamiento,
    description:
      'Inicia un tratamiento para un paciente: crea el tratamiento y su ' +
      'secuencia de fases.',
    parameters: {
      type: 'object',
      properties: {
        patient_id: {
          type: 'string',
          description: 'Id del paciente que inicia el tratamiento.',
        },
        treatment_type: {
          type: 'string',
          description: 'Tipo de tratamiento a iniciar.',
        },
      },
      required: ['patient_id', 'treatment_type'],
    },
  },
  {
    name: ToolName.AgendarTurno,
    description:
      'Agenda un turno. Siempre se crea en estado "proposed" (pendiente de ' +
      'confirmación). No confirma ni cobra.',
    parameters: {
      type: 'object',
      properties: {
        patient_id: { type: 'string', description: 'Id del paciente.' },
        professional_id: {
          type: 'string',
          description: 'Id del profesional que atiende.',
        },
        treatment_phase: {
          type: 'string',
          description: 'Fase del tratamiento a la que corresponde el turno.',
        },
        start_at: {
          type: 'string',
          description: 'Inicio del turno en ISO-8601.',
        },
      },
      required: ['patient_id', 'professional_id', 'treatment_phase', 'start_at'],
    },
  },
];
