import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import type { AuthUser } from '../auth/auth-user.interface';

/**
 * Tests del confirm de turnos con Prisma mockeado (sin BD).
 * Cubren: tenant en código, idempotencia, estados no confirmables y carrera.
 */

const USER: AuthUser = {
  userId: 'user-1',
  clinicId: 'clinic-1',
  role: 'reception',
};

const D1 = new Date('2026-07-01T15:00:00.000Z');
const D2 = new Date('2026-07-01T15:30:00.000Z');

function buildService() {
  const prisma = {
    appointments: {
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
    },
    runAsActor: jest.fn(),
  };
  const service = new AppointmentsService(prisma as never);
  return { service, prisma };
}

describe('AppointmentsService.confirm', () => {
  it('turno inexistente (o de otra clínica) → NotFound', async () => {
    const { service, prisma } = buildService();
    prisma.appointments.findFirst.mockResolvedValue(null);

    await expect(service.confirm('appt-1', USER)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    // El filtro de tenant viaja en el WHERE.
    expect(prisma.appointments.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'appt-1',
          clinic_id: 'clinic-1',
          deleted_at: null,
        }),
      }),
    );
    expect(prisma.runAsActor).not.toHaveBeenCalled();
  });

  it('ya confirmado → idempotente, sin escribir', async () => {
    const { service, prisma } = buildService();
    prisma.appointments.findFirst.mockResolvedValue({
      id: 'appt-1',
      status: 'confirmed',
      start_at: D1,
      end_at: D2,
    });

    const res = await service.confirm('appt-1', USER);
    expect(res).toEqual({
      id: 'appt-1',
      status: 'confirmed',
      start_at: D1.toISOString(),
      end_at: D2.toISOString(),
    });
    expect(prisma.runAsActor).not.toHaveBeenCalled();
  });

  it.each(['cancelled', 'completed', 'in_progress', 'no_show'])(
    'estado %s → Conflict',
    async (status) => {
      const { service, prisma } = buildService();
      prisma.appointments.findFirst.mockResolvedValue({
        id: 'appt-1',
        status,
        start_at: D1,
        end_at: D2,
      });

      await expect(service.confirm('appt-1', USER)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.runAsActor).not.toHaveBeenCalled();
    },
  );

  it('proposed → confirmed, en runAsActor con source staff', async () => {
    const { service, prisma } = buildService();
    prisma.appointments.findFirst.mockResolvedValue({
      id: 'appt-1',
      status: 'proposed',
      start_at: D1,
      end_at: D2,
    });
    prisma.runAsActor.mockImplementation((_actor, work) =>
      work({
        appointments: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      }),
    );
    prisma.appointments.findFirstOrThrow.mockResolvedValue({
      id: 'appt-1',
      status: 'confirmed',
      start_at: D1,
      end_at: D2,
    });

    const res = await service.confirm('appt-1', USER);
    expect(res.status).toBe('confirmed');
    expect(prisma.runAsActor).toHaveBeenCalledWith(
      { actorId: 'user-1', source: 'staff' },
      expect.any(Function),
    );
  });

  it('carrera: update afecta 0 filas pero quedó confirmado → idempotente', async () => {
    const { service, prisma } = buildService();
    prisma.appointments.findFirst
      .mockResolvedValueOnce({
        id: 'appt-1',
        status: 'proposed',
        start_at: D1,
        end_at: D2,
      })
      // re-lectura tras count===0
      .mockResolvedValueOnce({
        id: 'appt-1',
        status: 'confirmed',
        start_at: D1,
        end_at: D2,
      });
    prisma.runAsActor.mockImplementation((_actor, work) =>
      work({
        appointments: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      }),
    );

    const res = await service.confirm('appt-1', USER);
    expect(res.status).toBe('confirmed');
    expect(prisma.appointments.findFirstOrThrow).not.toHaveBeenCalled();
  });

  it('carrera: update afecta 0 filas y quedó en otro estado → Conflict', async () => {
    const { service, prisma } = buildService();
    prisma.appointments.findFirst
      .mockResolvedValueOnce({
        id: 'appt-1',
        status: 'proposed',
        start_at: D1,
        end_at: D2,
      })
      .mockResolvedValueOnce({
        id: 'appt-1',
        status: 'cancelled',
        start_at: D1,
        end_at: D2,
      });
    prisma.runAsActor.mockImplementation((_actor, work) =>
      work({
        appointments: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      }),
    );

    await expect(service.confirm('appt-1', USER)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
