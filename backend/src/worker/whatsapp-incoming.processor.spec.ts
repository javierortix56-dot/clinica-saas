import { WhatsappIncomingProcessor } from './whatsapp-incoming.processor';
import { ToolName } from '../ai/tools/tool-declarations';

/**
 * Tests de orquestación del worker (Paso 7) con TODO mockeado: sin Redis, BD ni
 * Gemini. Validan el flujo de decisión de `handle()` a través de `process()`:
 * ruteo, dedup, patient_id (discrepancia→handoff), y salida final/handoff.
 *
 * El e2e real (Gemini AIza + Redis + BD) vive en el test de integración gated.
 */
function setup() {
  const lock = {
    acquire: jest.fn().mockResolvedValue(true),
    startHeartbeat: jest.fn().mockReturnValue(() => undefined),
    release: jest.fn().mockResolvedValue(undefined),
  };
  const conversation = {
    route: jest.fn().mockResolvedValue({ clinicId: 'clinic-1' }),
    isAlreadyProcessed: jest.fn().mockResolvedValue(false),
    resolveConversation: jest
      .fn()
      .mockResolvedValue({ id: 'conv-1', clinic_id: 'clinic-1', patient_id: null }),
    loadHistory: jest.fn().mockResolvedValue([]),
    clinicPromptContext: jest
      .fn()
      .mockResolvedValue({ name: 'Clínica X', timezone: 'America/Argentina/Buenos_Aires' }),
    persistTurn: jest.fn().mockResolvedValue(undefined),
    setPatientIfUnset: jest
      .fn()
      .mockResolvedValue({ set: false, discrepancy: false }),
    markHandedOff: jest.fn().mockResolvedValue(undefined),
  };
  const systemPrompt = { build: jest.fn().mockReturnValue('SYS') };
  const loop = {
    runTurn: jest.fn().mockResolvedValue({
      outcome: 'final',
      text: 'respuesta del bot',
      newMessages: [
        { role: 'user', content: 'hola' },
        { role: 'assistant', content: 'respuesta del bot' },
      ],
      rounds: 1,
    }),
  };
  const whatsapp = { sendTextMessage: jest.fn().mockResolvedValue(undefined) };
  const config = {
    get: jest.fn().mockReturnValue(undefined),
    getOrThrow: jest.fn().mockReturnValue('bot-uuid'),
  };

  const processor = new WhatsappIncomingProcessor(
    lock as never,
    conversation as never,
    systemPrompt as never,
    loop as never,
    whatsapp as never,
    config as never,
  );
  const job = {
    data: {
      phoneNumberId: 'pn-1',
      contactPhone: '5491133334444',
      waMessageId: 'wamid.1',
      text: 'hola',
    },
  };
  return { processor, job, lock, conversation, systemPrompt, loop, whatsapp };
}

const run = (p: ReturnType<typeof setup>) => p.processor.process(p.job as never, 'tok');

describe('WhatsappIncomingProcessor — orquestación', () => {
  it('canal desconocido (ruteo falla): no corre el loop ni responde', async () => {
    const ctx = setup();
    ctx.conversation.route.mockResolvedValue(null);
    await run(ctx);
    expect(ctx.loop.runTurn).not.toHaveBeenCalled();
    expect(ctx.whatsapp.sendTextMessage).not.toHaveBeenCalled();
    expect(ctx.lock.release).toHaveBeenCalled(); // siempre libera el lock
  });

  it('mensaje ya procesado (dedup B1): no corre el loop ni responde', async () => {
    const ctx = setup();
    ctx.conversation.isAlreadyProcessed.mockResolvedValue(true);
    await run(ctx);
    expect(ctx.loop.runTurn).not.toHaveBeenCalled();
    expect(ctx.whatsapp.sendTextMessage).not.toHaveBeenCalled();
  });

  it('camino feliz: persiste el turno y responde el texto final', async () => {
    const ctx = setup();
    await run(ctx);
    expect(ctx.loop.runTurn).toHaveBeenCalledTimes(1);
    expect(ctx.conversation.persistTurn).toHaveBeenCalledWith(
      'clinic-1',
      'conv-1',
      expect.any(Array),
      'wamid.1',
    );
    expect(ctx.whatsapp.sendTextMessage).toHaveBeenCalledWith(
      '5491133334444',
      'respuesta del bot',
    );
  });

  it('fija patient_id cuando buscar_paciente_por_dni devuelve un match', async () => {
    const ctx = setup();
    ctx.loop.runTurn.mockResolvedValue({
      outcome: 'final',
      text: 'ok',
      rounds: 2,
      newMessages: [
        { role: 'user', content: 'mi dni es 123' },
        {
          role: 'tool',
          name: ToolName.BuscarPacientePorDni,
          content: JSON.stringify({
            ok: true,
            data: { found: true, patient: { patient_id: 'pat-7' } },
          }),
        },
        { role: 'assistant', content: 'ok' },
      ],
    });
    await run(ctx);
    expect(ctx.conversation.setPatientIfUnset).toHaveBeenCalledWith(
      'conv-1',
      'pat-7',
    );
    expect(ctx.whatsapp.sendTextMessage).toHaveBeenCalledWith('5491133334444', 'ok');
  });

  it('discrepancia de identidad → handoff (no manda el texto final)', async () => {
    const ctx = setup();
    ctx.conversation.setPatientIfUnset.mockResolvedValue({
      set: false,
      discrepancy: true,
    });
    ctx.loop.runTurn.mockResolvedValue({
      outcome: 'final',
      text: 'texto que NO debe enviarse',
      rounds: 1,
      newMessages: [
        { role: 'user', content: 'soy otro' },
        {
          role: 'tool',
          name: ToolName.RegistrarPaciente,
          content: JSON.stringify({ ok: true, data: { patient_id: 'pat-9' } }),
        },
        { role: 'assistant', content: 'texto que NO debe enviarse' },
      ],
    });
    await run(ctx);
    expect(ctx.conversation.markHandedOff).toHaveBeenCalledWith('conv-1');
    expect(ctx.whatsapp.sendTextMessage).toHaveBeenCalledTimes(1);
    const [, body] = ctx.whatsapp.sendTextMessage.mock.calls[0];
    expect(body).toMatch(/derivar/i);
    expect(body).not.toBe('texto que NO debe enviarse');
  });

  it('outcome handoff (MAX_TOOL_ROUNDS): marca handed_off y deriva', async () => {
    const ctx = setup();
    ctx.loop.runTurn.mockResolvedValue({
      outcome: 'handoff',
      reason: 'max_tool_rounds',
      rounds: 8,
      newMessages: [{ role: 'user', content: 'hola' }],
    });
    await run(ctx);
    expect(ctx.conversation.markHandedOff).toHaveBeenCalledWith('conv-1');
    const [, body] = ctx.whatsapp.sendTextMessage.mock.calls[0];
    expect(body).toMatch(/derivar/i);
  });
});
