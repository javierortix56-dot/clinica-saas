import { ToolContext } from './tool-context';
import { ToolName } from './tool-declarations';
import { ok, ToolResult } from './tool-result';

/**
 * Stubs de las 8 tools (blueprint §4, §7). En el Paso 4 NO hay lógica de negocio
 * ni acceso a BD: cada stub devuelve un payload de ejemplo `{ ok:true, data }`
 * para que el loop ejecute una ronda completa y el modelo reciba resultados con
 * la forma definitiva. La lógica real (queries Prisma, cool-down, prime time) es
 * Paso 5+.
 *
 * Firma de un stub: recibe los `args` (NO confiables, validados aguas arriba) y
 * el `ctx` server-side (clinicId/actor inyectados), devuelve un `ToolResult`.
 */
export type ToolStub = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<ToolResult>;

const buscarPacientePorDni: ToolStub = async (args) =>
  ok({
    found: true,
    patient: {
      patient_id: 'stub-patient-0001',
      dni: String(args.dni ?? ''),
      nombre: 'Paciente',
      apellido: 'De Ejemplo',
    },
    _stub: true,
  });

const consultarCatalogo: ToolStub = async (args) =>
  ok({
    treatment_type: args.treatment_type ?? null,
    valoracion: { precio: 0, moneda: 'ARS' },
    rango_precios: { min: 0, max: 0, moneda: 'ARS', orientativo: true },
    _stub: true,
  });

const consultarPoliticasClinica: ToolStub = async (args) =>
  ok({
    tema: args.tema ?? 'todas',
    politicas: [
      { tema: 'puntualidad', texto: 'Texto de ejemplo (stub).' },
      { tema: 'no_show', texto: 'Texto de ejemplo (stub).' },
    ],
    _stub: true,
  });

/**
 * RESUMEN SEGURO (blueprint §6): tratamientos, fechas, profesional y estado de
 * fase. NUNCA `clinical_notes` — esa tabla queda fuera del alcance del actor bot
 * a nivel RLS, igual que para recepción. El bot puede priorizar una urgencia sin
 * exponer la nota clínica.
 */
const consultarHistorialPaciente: ToolStub = async (args) =>
  ok({
    patient_id: String(args.patient_id ?? ''),
    tratamientos: [
      {
        treatment_id: 'stub-treatment-0001',
        treatment_type: 'ortodoncia',
        professional: { professional_id: 'stub-prof-0001', nombre: 'Dr. Ejemplo' },
        iniciado_en: '2026-01-10',
        fase_actual: { nombre: 'colocacion', estado: 'in_progress' },
      },
    ],
    // Marca explícita del contrato: jamás se exponen notas clínicas.
    clinical_notes_excluidas: true,
    _stub: true,
  });

const proponerTurnos: ToolStub = async (args) =>
  ok({
    treatment_type: args.treatment_type ?? null,
    propuestas: [
      { professional_id: 'stub-prof-0001', start_at: '2026-06-20T14:00:00-03:00' },
      { professional_id: 'stub-prof-0001', start_at: '2026-06-21T10:30:00-03:00' },
    ],
    _stub: true,
  });

const registrarPaciente: ToolStub = async (args) =>
  ok({
    patient_id: 'stub-patient-new-0001',
    dni: String(args.dni ?? ''),
    nombre: String(args.nombre ?? ''),
    apellido: String(args.apellido ?? ''),
    created: true,
    _stub: true,
  });

const iniciarTratamiento: ToolStub = async (args) =>
  ok({
    treatment_id: 'stub-treatment-new-0001',
    patient_id: String(args.patient_id ?? ''),
    treatment_type: String(args.treatment_type ?? ''),
    fases: [
      { nombre: 'valoracion', estado: 'pending' },
      { nombre: 'colocacion', estado: 'pending' },
    ],
    _stub: true,
  });

const agendarTurno: ToolStub = async (args) =>
  ok({
    appointment_id: 'stub-appt-0001',
    patient_id: String(args.patient_id ?? ''),
    professional_id: String(args.professional_id ?? ''),
    treatment_phase: String(args.treatment_phase ?? ''),
    start_at: String(args.start_at ?? ''),
    estado: 'proposed',
    _stub: true,
  });

/** Registro nombre-de-tool → stub. El executor enruta por acá. */
export const TOOL_STUBS: Record<ToolName, ToolStub> = {
  [ToolName.BuscarPacientePorDni]: buscarPacientePorDni,
  [ToolName.ConsultarCatalogo]: consultarCatalogo,
  [ToolName.ConsultarPoliticasClinica]: consultarPoliticasClinica,
  [ToolName.ConsultarHistorialPaciente]: consultarHistorialPaciente,
  [ToolName.ProponerTurnos]: proponerTurnos,
  [ToolName.RegistrarPaciente]: registrarPaciente,
  [ToolName.IniciarTratamiento]: iniciarTratamiento,
  [ToolName.AgendarTurno]: agendarTurno,
};
