import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ToolContext } from '../../ai/tools/tool-context';
import { ToolHandler } from '../../ai/tools/tool-handler.interface';
import { ToolName } from '../../ai/tools/tool-declarations';
import { fail, ok, ToolResult } from '../../ai/tools/tool-result';
import {
  InvalidArgsError,
  optionalString,
  requireString,
} from '../../ai/tools/args.util';
import { mapDbError } from '../../ai/tools/db-error.mapper';

/**
 * `registrar_paciente` (W) — blueprint Paso 5 §5.F.
 * IDEMPOTENTE: si el DNI ya existe, devuelve el paciente existente como éxito
 * (`created:false`), no error. La escritura corre en `runAsBot` (auditoría).
 */
@Injectable()
export class RegistrarPacienteHandler implements ToolHandler {
  readonly name = ToolName.RegistrarPaciente;
  private readonly logger = new Logger(RegistrarPacienteHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    let dni: string, nombre: string, apellido: string, telefono: string | undefined;
    try {
      dni = requireString(args, 'dni');
      nombre = requireString(args, 'nombre');
      apellido = requireString(args, 'apellido');
      telefono = optionalString(args, 'telefono');
    } catch (e) {
      if (e instanceof InvalidArgsError) return fail('INVALID_ARGS', e.message);
      throw e;
    }

    const fullName = `${nombre} ${apellido}`;

    try {
      // Pre-check de idempotencia: si ya existe, lo devolvemos sin insertar.
      const existing = await this.prisma.patients.findFirst({
        where: { clinic_id: ctx.clinicId, national_id: dni, deleted_at: null },
        select: { id: true, national_id: true, full_name: true },
      });
      if (existing) {
        return ok({
          patient_id: existing.id,
          dni: existing.national_id,
          full_name: existing.full_name,
          created: false,
        });
      }

      const created = await this.prisma.runAsBot(ctx.actor.actorId, (tx) =>
        tx.patients.create({
          data: {
            clinic_id: ctx.clinicId,
            national_id: dni,
            full_name: fullName,
            phone: telefono ?? null,
          },
          select: { id: true, national_id: true, full_name: true },
        }),
      );

      return ok({
        patient_id: created.id,
        dni: created.national_id,
        full_name: created.full_name,
        created: true,
      });
    } catch (err) {
      // Red de seguridad ante carrera contra el unique (23505) → DUPLICATE_PATIENT.
      return mapDbError(err, this.logger, this.name);
    }
  }
}
