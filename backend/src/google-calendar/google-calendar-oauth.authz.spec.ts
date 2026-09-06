import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GoogleCalendarOAuthService } from './google-calendar-oauth.service';
import type { AuthUser } from '../auth/auth-user.interface';

/**
 * Autorización para gestionar el Google Calendar de un profesional.
 *
 * El endpoint exigía `@Roles('admin')`, así que en un consultorio de un solo
 * médico —donde el dueño tiene rol `doctor`— conectar el calendario devolvía
 * 403. Estos tests fijan quién puede: admin, dueño, y el propio profesional.
 */

const PROF_ID = 'prof-1';

function buildService() {
  const prisma = {
    professionals: { findFirst: jest.fn() },
  };
  const service = new GoogleCalendarOAuthService(
    prisma as never,
    {} as never,
    { get: () => '' } as never,
  );
  return { service, prisma };
}

function user(over: Partial<AuthUser>): AuthUser {
  return {
    userId: 'user-1',
    clinicId: 'clinic-1',
    role: 'doctor',
    isOwner: false,
    ...over,
  };
}

describe('GoogleCalendarOAuthService.authorizeCalendarManagement', () => {
  it('profesional de otra clínica (o inexistente) → NotFound', async () => {
    const { service, prisma } = buildService();
    prisma.professionals.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.authorizeCalendarManagement(PROF_ID, user({ role: 'admin' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('admin puede gestionar cualquier profesional de su clínica', async () => {
    const { service, prisma } = buildService();
    prisma.professionals.findFirst.mockResolvedValueOnce({ id: PROF_ID });

    await expect(
      service.authorizeCalendarManagement(PROF_ID, user({ role: 'admin' })),
    ).resolves.toBeUndefined();
    // Solo la validación de tenant: no hace falta el lookup de pertenencia.
    expect(prisma.professionals.findFirst).toHaveBeenCalledTimes(1);
  });

  it('dueño con rol doctor puede gestionar (caso consultorio individual)', async () => {
    const { service, prisma } = buildService();
    prisma.professionals.findFirst.mockResolvedValueOnce({ id: PROF_ID });

    await expect(
      service.authorizeCalendarManagement(
        PROF_ID,
        user({ role: 'doctor', isOwner: true }),
      ),
    ).resolves.toBeUndefined();
  });

  it('doctor no dueño puede gestionar SU propio calendario', async () => {
    const { service, prisma } = buildService();
    prisma.professionals.findFirst
      .mockResolvedValueOnce({ id: PROF_ID }) // validación de tenant
      .mockResolvedValueOnce({ id: PROF_ID }); // le pertenece

    await expect(
      service.authorizeCalendarManagement(PROF_ID, user({})),
    ).resolves.toBeUndefined();
  });

  it('doctor no dueño NO puede gestionar el calendario de otro', async () => {
    const { service, prisma } = buildService();
    prisma.professionals.findFirst
      .mockResolvedValueOnce({ id: PROF_ID }) // existe en la clínica
      .mockResolvedValueOnce(null); // pero no es suyo

    await expect(
      service.authorizeCalendarManagement(PROF_ID, user({})),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
