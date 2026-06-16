import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
// Se usa el ConfigModule de @nestjs/config directamente (sin la validación
// eager del ConfigModule de la app, que tira al importarse si faltan envs). El
// e2e solo necesita DATABASE_URL + GEMINI_API_KEY (garantizados por el gate).
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { AiModule } from '../ai/ai.module';
import { PrismaService } from '../database/prisma.service';
import { ConversationLoopService } from '../ai/conversation-loop.service';
import { SystemPromptService } from '../conversation/system-prompt.service';
import { LlmMessage } from '../ai/llm/llm-client.interface';
import { ToolName } from '../ai/tools/tool-declarations';

// ==========================================
// CONFIGURACIÓN DE TIMEOUT GLOBAL PARA JEST
// ==========================================
jest.setTimeout(60000); // 60 segundos de colchón para llamadas de red/BD

/**
 * E2E de los Escenarios 1 y 2 (docs/flujos_conversacion_whatsapp.md), Paso 7.
 *
 * GATED: corre solo con `RUN_E2E=true` + `GEMINI_API_KEY` (key AIza válida, NO la
 * AQ. que da 401 — ver blueprint Paso 4 §0) + `DATABASE_URL`/`DIRECT_URL` a una BD
 * de prueba. Sin esas variables queda `skipped` (pero el archivo igual se
 * typechequea al correr jest). NO usa Redis: levanta solo Config + Database + Ai,
 * y ejercita `ConversationLoopService.runTurn` (la inteligencia conversacional:
 * Gemini real + tools reales + BD sembrada), que es lo que validan los escenarios.
 *
 * Alcance (decisión GAP E): cada escenario cubre EXACTAMENTE lo que especifica el
 * doc — Esc1 hasta la pregunta de condiciones; Esc2 hasta ofrecer slots. No llega
 * a agendar_turno (flujo completo de reserva = caso aparte, futuro).
 *
 * Nota: las aserciones de texto del LLM son intencionalmente laxas (el modelo no
 * es determinista); lo robusto es verificar QUÉ tools se invocaron. Los umbrales
 * de texto pueden requerir ajuste la primera vez que se corra con una key real.
 */

const E2E_ENABLED =
  process.env.RUN_E2E === 'true' &&
  !!process.env.GEMINI_API_KEY &&
  !!process.env.DATABASE_URL;

const describeE2E = E2E_ENABLED ? describe : describe.skip;

// clinic_id FIJO: permite pre-limpiar en beforeAll (borrar residuo de una corrida
// anterior que haya fallado el teardown) y volver a sembrar. Hace el e2e
// idempotente: correrlo dos veces seguidas da el mismo resultado.
const CLINIC_ID = '11111111-1111-4111-8111-1111111111e2';
const NEW_PATIENT_DNI = '99887766';
const SOFIA_DNI = '30111222';

/** Nombres de las tools invocadas en un turno (mensajes role='tool'). */
function toolsUsed(messages: LlmMessage[]): string[] {
  return messages.filter((m) => m.role === 'tool' && m.name).map((m) => m.name!);
}

/** Texto final del turno (último assistant sin toolCalls). */
function finalText(messages: LlmMessage[]): string {
  const assistants = messages.filter(
    (m) => m.role === 'assistant' && (!m.toolCalls || m.toolCalls.length === 0),
  );
  return (assistants[assistants.length - 1]?.content ?? '').toLowerCase();
}

describeE2E('E2E Escenarios de conversación (Gemini + BD)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let loop: ConversationLoopService;
  let system: string;

  // Ids sembrados (para cleanup).
  const ids = {
    clinic: '',
    staff: '',
    professional: '',
    implantType: '',
    valoracionType: '',
    restauracionType: '',
    implantPhase: '',
    valoracionPhase: '',
    sofia: '',
    sofiaTreatment: '',
  };

  // Se añade explícitamente el timeout de 60000 como segundo parámetro del hook
  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        NestConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        AiModule,
      ],
    }).compile();
    await moduleRef.init();

    prisma = moduleRef.get(PrismaService);
    loop = moduleRef.get(ConversationLoopService);
    system = new SystemPromptService().build({
      name: 'Clínica Premium',
      timezone: 'America/Argentina/Buenos_Aires',
    });

    // Pre-limpieza: borra cualquier residuo de una corrida previa (idempotencia),
    // luego siembra desde cero.
    await cleanup();
    await seed();
  }, 60000);

  // Se añade explícitamente el timeout de 60000 como segundo parámetro del hook
  afterAll(async () => {
    await cleanup();
    await moduleRef?.close();
  }, 60000);

  /** Siembra el set mínimo para ambos escenarios. */
  async function seed(): Promise<void> {
    const clinic = await prisma.clinics.create({
      data: {
        id: CLINIC_ID, // id fijo para pre-limpieza idempotente
        name: 'Clínica Premium',
        timezone: 'America/Argentina/Buenos_Aires',
        currency: 'ARS',
        valuation_fee: 15000,
      },
    });
    ids.clinic = clinic.id;

    const staff = await prisma.staff_members.create({
      data: {
        auth_user_id: randomUUID(),
        clinic_id: clinic.id,
        role: 'doctor',
        full_name: 'Dr. Pérez',
        is_active: true,
      },
    });
    ids.staff = staff.id;

    const professional = await prisma.professionals.create({
      data: { staff_member_id: staff.id, clinic_id: clinic.id },
    });
    ids.professional = professional.id;

    // Disponibilidad todos los días 09:00–20:00 (hora local de la clínica), para
    // que proponer_turnos encuentre slots hoy y mañana.
    for (let weekday = 0; weekday <= 6; weekday++) {
      await prisma.professional_availability.create({
        data: {
          clinic_id: clinic.id,
          professional_id: professional.id,
          weekday,
          start_time: new Date(Date.UTC(1970, 0, 1, 9, 0)),
          end_time: new Date(Date.UTC(1970, 0, 1, 20, 0)),
        },
      });
    }

    // Catálogo: implante (con pitch premium en description) + valoración (consulta).
    const implant = await prisma.treatment_types.create({
      data: {
        clinic_id: clinic.id,
        name: 'Implante dental',
        description:
          'Implantes de titanio importado de alta biocompatibilidad y coronas de ' +
          'zirconio puro diseñadas digitalmente (tecnología CAD/CAM).',
        price_min: 800000,
        price_max: 1200000,
        is_active: true,
      },
    });
    ids.implantType = implant.id;
    const implantPhase = await prisma.treatment_phase_templates.create({
      data: {
        clinic_id: clinic.id,
        treatment_type_id: implant.id,
        sequence_order: 1,
        name: 'Colocación de implante',
        phase_kind: 'clinical',
        duration_minutes: 60,
      },
    });
    ids.implantPhase = implantPhase.id;

    const valoracion = await prisma.treatment_types.create({
      data: {
        clinic_id: clinic.id,
        name: 'Valoración',
        description: 'Consulta de valoración clínica inicial.',
        is_active: true,
      },
    });
    ids.valoracionType = valoracion.id;
    const valoracionPhase = await prisma.treatment_phase_templates.create({
      data: {
        clinic_id: clinic.id,
        treatment_type_id: valoracion.id,
        sequence_order: 1,
        name: 'Consulta de valoración',
        phase_kind: 'clinical',
        duration_minutes: 30,
      },
    });
    ids.valoracionPhase = valoracionPhase.id;

    const restauracion = await prisma.treatment_types.create({
      data: { clinic_id: clinic.id, name: 'Restauración profunda', is_active: true },
    });
    ids.restauracionType = restauracion.id;

    // Sofía: paciente existente con un tratamiento previo del Dr. Pérez (~3 semanas).
    const sofia = await prisma.patients.create({
      data: {
        clinic_id: clinic.id,
        national_id: SOFIA_DNI,
        full_name: 'Sofía Gómez',
      },
    });
    ids.sofia = sofia.id;
    const threeWeeksAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);
    const treatment = await prisma.treatments.create({
      data: {
        clinic_id: clinic.id,
        patient_id: sofia.id,
        treatment_type_id: restauracion.id,
        primary_professional_id: professional.id, // clave para "con el Dr. Pérez"
        status: 'in_progress',
        created_at: threeWeeksAgo,
      },
    });
    ids.sofiaTreatment = treatment.id;
  }

  /**
   * Borra TODO lo asociado a la clínica fija, en orden FK-safe (hijos → padres).
   * Cubre también lo que el LLM pudiera escribir en un turno (appointments,
   * treatments, patients…), para que el teardown no falle por una FK colgada y el
   * e2e quede idempotente. Se corre en beforeAll (pre-limpieza) y en afterAll.
   */
  async function cleanup(): Promise<void> {
    const where = { clinic_id: CLINIC_ID };
    await prisma.appointment_modifiers.deleteMany({
      where: { appointments: { clinic_id: CLINIC_ID } },
    });
    await prisma.appointments.deleteMany({ where });
    await prisma.clinical_notes.deleteMany({ where });
    await prisma.treatments.deleteMany({ where });
    await prisma.treatment_phase_templates.deleteMany({ where });
    await prisma.treatment_types.deleteMany({ where });
    await prisma.technology_modifiers.deleteMany({ where });
    await prisma.availability_exceptions.deleteMany({ where });
    await prisma.professional_availability.deleteMany({ where });
    await prisma.conversation_messages.deleteMany({ where });
    await prisma.conversations.deleteMany({ where });
    await prisma.professional_calendar_links.deleteMany({ where });
    await prisma.patients.deleteMany({ where });
    await prisma.professionals.deleteMany({ where });
    await prisma.staff_members.deleteMany({ where });
    await prisma.whatsapp_channels.deleteMany({ where });
    await prisma.audit_logs.deleteMany({ where }); // sin FK; se borra por prolijidad
    await prisma.clinics.deleteMany({ where: { id: CLINIC_ID } });
  }

  /** Corre una conversación multi-turno acumulando historial. */
  function makeConversation() {
    const ctx = {
      conversationId: randomUUID(),
      clinicId: ids.clinic,
      actor: { actorId: randomUUID(), source: 'whatsapp_bot' as const },
      patientId: undefined as string | undefined,
    };
    let history: LlmMessage[] = [];
    return async (text: string) => {
      const res = await loop.runTurn({ ctx, history, system, incomingMessage: text });
      history = [...history, ...res.newMessages];
      return res;
    };
  }

  it('Escenario 1 — presupuesto de implante (paciente nuevo)', async () => {
    const say = makeConversation();

    // 1) Consulta de precio: el bot asesora calidad (del catálogo) y pide DNI.
    const r1 = await say('Hola, quería saber cuánto me sale ponerme un implante.');
    expect(toolsUsed(r1.newMessages)).toContain(ToolName.ConsultarCatalogo);
    const t1 = finalText(r1.newMessages);
    expect(t1).toMatch(/titanio|zirconio|cad\/cam/); // pitch desde description
    expect(t1).toMatch(/dni|documento/);

    // 2) Da un DNI nuevo: el bot informa valoración + puntualidad y pide conformidad.
    const r2 = await say(`Mi DNI es ${NEW_PATIENT_DNI}`);
    const tools2 = toolsUsed(r2.newMessages);
    expect(tools2).toContain(ToolName.BuscarPacientePorDni);
    expect(tools2).toContain(ToolName.ConsultarPoliticasClinica);
    const t2 = finalText(r2.newMessages);
    expect(t2).toMatch(/valoraci[oó]n/);
    expect(t2).toMatch(/10/); // tolerancia de 10 minutos
  });

  it('Escenario 2 — urgencia de paciente recurrente (Sofía)', async () => {
    const say = makeConversation();

    // 1) Urgencia: el bot pide el DNI para acceder a la ficha.
    const r1 = await say('Hola, soy Sofía. Me duele muchísimo la muela que me arreglaron.');
    expect(finalText(r1.newMessages)).toMatch(/dni|documento/);

    // 2) Da su DNI existente: busca, recupera historial y ofrece turnos.
    const r2 = await say(`Mi DNI es ${SOFIA_DNI}`);
    const tools2 = toolsUsed(r2.newMessages);
    expect(tools2).toContain(ToolName.BuscarPacientePorDni);
    expect(tools2).toContain(ToolName.ConsultarHistorialPaciente);
    expect(tools2).toContain(ToolName.ProponerTurnos);
    expect(finalText(r2.newMessages)).toMatch(/p[eé]rez/); // reconoce al profesional
  });
});
