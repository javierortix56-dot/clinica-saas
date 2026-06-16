import { SchedulingService, PhaseTemplate } from './scheduling.service';

/**
 * Tests B4 — cool-down / resolución de fase, con Prisma mockeado (sin BD).
 * Cubren `cooldownConstraint`, que espeja `validate_treatment_sequence`.
 */

const PHASES: PhaseTemplate[] = [
  { id: 'p1', name: 'valoracion', sequence_order: 1, phase_kind: 'clinical', duration_minutes: 30 },
  { id: 'p2', name: 'espera_lab', sequence_order: 2, phase_kind: 'lab_wait', duration_minutes: null },
  { id: 'p3', name: 'colocacion', sequence_order: 3, phase_kind: 'clinical', duration_minutes: 60 },
];

function buildService() {
  const prisma = {
    treatment_phase_templates: {
      findMany: jest.fn().mockResolvedValue(PHASES),
      aggregate: jest.fn(),
    },
    appointments: {
      findFirst: jest.fn(),
    },
  };
  const service = new SchedulingService(prisma as never);
  return { service, prisma };
}

describe('SchedulingService.cooldownConstraint (B4)', () => {
  it('primera fase clínica: sin restricción (minStart null)', async () => {
    const { service, prisma } = buildService();
    const res = await service.cooldownConstraint('t1', 'tt1', PHASES[0]);
    expect(res).toEqual({ kind: 'ok', minStart: null });
    // No debe consultar cool-down ni turno previo si no hay fase clínica anterior.
    expect(prisma.treatment_phase_templates.aggregate).not.toHaveBeenCalled();
    expect(prisma.appointments.findFirst).not.toHaveBeenCalled();
  });

  it('falta el turno de la fase clínica previa → missing_prev', async () => {
    const { service, prisma } = buildService();
    prisma.treatment_phase_templates.aggregate.mockResolvedValue({
      _sum: { cooldown_days: 5 },
    });
    prisma.appointments.findFirst.mockResolvedValue(null);

    const res = await service.cooldownConstraint('t1', 'tt1', PHASES[2]);
    expect(res).toEqual({ kind: 'missing_prev' });
  });

  it('suma el cool-down de las lab_wait intermedias al fin del turno previo', async () => {
    const { service, prisma } = buildService();
    prisma.treatment_phase_templates.aggregate.mockResolvedValue({
      _sum: { cooldown_days: 5 },
    });
    const prevEnd = new Date('2026-06-01T12:00:00.000Z');
    prisma.appointments.findFirst.mockResolvedValue({ end_at: prevEnd });

    const res = await service.cooldownConstraint('t1', 'tt1', PHASES[2]);
    expect(res.kind).toBe('ok');
    // 12:00 del 1-jun + 5 días => 12:00 del 6-jun.
    expect((res as { minStart: Date }).minStart.toISOString()).toBe(
      '2026-06-06T12:00:00.000Z',
    );
  });

  it('sin lab_wait intermedia (cooldown 0): minStart = fin del turno previo', async () => {
    const { service, prisma } = buildService();
    prisma.treatment_phase_templates.aggregate.mockResolvedValue({
      _sum: { cooldown_days: null },
    });
    const prevEnd = new Date('2026-06-01T12:00:00.000Z');
    prisma.appointments.findFirst.mockResolvedValue({ end_at: prevEnd });

    const res = await service.cooldownConstraint('t1', 'tt1', PHASES[2]);
    expect((res as { minStart: Date }).minStart.toISOString()).toBe(
      prevEnd.toISOString(),
    );
  });
});

describe('SchedulingService.firstClinicalPhase (B4)', () => {
  it('devuelve la primera fase clínica por sequence_order', async () => {
    const prisma = {
      treatment_phase_templates: {
        findFirst: jest.fn().mockResolvedValue(PHASES[0]),
      },
    };
    const service = new SchedulingService(prisma as never);
    const phase = await service.firstClinicalPhase('tt1');
    expect(phase?.id).toBe('p1');
    // Debe filtrar por fase clínica y ordenar ascendente.
    expect(prisma.treatment_phase_templates.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ phase_kind: 'clinical' }),
        orderBy: { sequence_order: 'asc' },
      }),
    );
  });
});
