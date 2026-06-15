import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { LlmMessage, LlmToolCall } from '../ai/llm/llm-client.interface';

export interface ConversationRecord {
  id: string;
  clinic_id: string;
  patient_id: string | null;
}

/**
 * ConversationModule (blueprint Paso 6 §6): ruteo `phone_number_id → clinic_id`,
 * resolución/creación de la conversación, carga/persistencia del historial en
 * FORMATO NEUTRO (`LlmMessage`, nunca formato Gemini — D3) y manejo de
 * `patient_id` (primer match lo fija; discrepancia → handoff — D5).
 *
 * Escrituras que disparan auditoría (conversations) van por `runAsBot` con
 * `BOT_ACTOR_ID`. Los mensajes (`conversation_messages`) son append-only sin
 * trigger de auditoría: inserts planos.
 */
@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);
  private readonly botActorId: string;
  private static readonly HISTORY_LIMIT = 50;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.botActorId = config.getOrThrow<string>('BOT_ACTOR_ID');
  }

  /** D1 — `phone_number_id → clinic_id` por canal activo. */
  async route(phoneNumberId: string): Promise<{ clinicId: string } | null> {
    const channel = await this.prisma.whatsapp_channels.findFirst({
      where: { phone_number_id: phoneNumberId, is_active: true, deleted_at: null },
      select: { clinic_id: true },
    });
    return channel ? { clinicId: channel.clinic_id } : null;
  }

  /** D2 — conversación activa por (clínica, teléfono); crea si no hay. */
  async resolveConversation(
    clinicId: string,
    contactPhone: string,
  ): Promise<ConversationRecord> {
    const existing = await this.prisma.conversations.findFirst({
      where: {
        clinic_id: clinicId,
        contact_phone: contactPhone,
        status: 'active',
        deleted_at: null,
      },
      select: { id: true, clinic_id: true, patient_id: true },
    });
    if (existing) return existing;

    return this.prisma.runAsBot(this.botActorId, (tx) =>
      tx.conversations.create({
        data: { clinic_id: clinicId, contact_phone: contactPhone, status: 'active' },
        select: { id: true, clinic_id: true, patient_id: true },
      }),
    );
  }

  /**
   * B1 (segunda capa) — ¿ya procesamos este `wa_message_id`? El mensaje del
   * usuario se persiste recién al final del turno (junto con la respuesta), así
   * que su presencia implica que el turno se completó. Esto hace el reintento
   * seguro: un intento que crasheó a mitad NO dejó el mensaje, y el retry
   * reprocesa; un reenvío tardío de Meta sí lo encuentra y se descarta.
   */
  async isAlreadyProcessed(
    clinicId: string,
    waMessageId: string,
  ): Promise<boolean> {
    const found = await this.prisma.conversation_messages.findFirst({
      where: { clinic_id: clinicId, wa_message_id: waMessageId },
      select: { id: true },
    });
    return found !== null;
  }

  /** D3 — historial (últimos N) en formato neutro `LlmMessage[]`. */
  async loadHistory(conversationId: string): Promise<LlmMessage[]> {
    const rows = await this.prisma.conversation_messages.findMany({
      where: { conversation_id: conversationId },
      orderBy: { created_at: 'desc' },
      take: ConversationService.HISTORY_LIMIT,
      select: { role: true, content: true, tool_calls: true },
    });
    rows.reverse(); // a orden cronológico ascendente

    return rows.map((r) => {
      const msg: LlmMessage = { role: r.role as LlmMessage['role'] };
      if (r.content !== null) msg.content = r.content;
      if (r.role === 'assistant' && r.tool_calls) {
        msg.toolCalls = r.tool_calls as unknown as LlmToolCall[];
      }
      if (r.role === 'tool' && r.tool_calls) {
        const meta = r.tool_calls as { toolCallId?: string; name?: string };
        msg.toolCallId = meta.toolCallId;
        msg.name = meta.name;
      }
      return msg;
    });
  }

  /**
   * D4 — persiste TODO el turno de forma atómica: el mensaje del usuario (con
   * `wa_message_id`, único role 'user' en `newMessages`) + assistant / tool /
   * assistant final. Persistir el mensaje del usuario al final (no antes) hace el
   * reintento seguro y deja el `wa_message_id` como marca de "turno completado"
   * (ver `isAlreadyProcessed`). El índice `uq_wa_message` es el backstop ante
   * carreras.
   */
  async persistTurn(
    clinicId: string,
    conversationId: string,
    newMessages: LlmMessage[],
    waMessageId: string,
  ): Promise<void> {
    if (newMessages.length > 0) {
      await this.prisma.conversation_messages.createMany({
        data: newMessages.map((m) => ({
          clinic_id: clinicId,
          conversation_id: conversationId,
          role: m.role,
          content: m.content ?? null,
          tool_calls: this.toolCallsColumn(m),
          wa_message_id: m.role === 'user' ? waMessageId : null,
        })),
      });
    }
    await this.prisma.runAsBot(this.botActorId, (tx) =>
      tx.conversations.update({
        where: { id: conversationId },
        data: { last_message_at: new Date() },
      }),
    );
  }

  private toolCallsColumn(m: LlmMessage): Prisma.InputJsonValue | undefined {
    if (m.role === 'assistant' && m.toolCalls) {
      return m.toolCalls as unknown as Prisma.InputJsonValue;
    }
    if (m.role === 'tool') {
      return { toolCallId: m.toolCallId, name: m.name } as Prisma.InputJsonValue;
    }
    return undefined; // columna queda NULL
  }

  /**
   * D5 — fija `patient_id` en el primer match. Si ya estaba seteado y el nuevo
   * difiere, NO sobreescribe: reporta discrepancia (candidato a handoff).
   */
  async setPatientIfUnset(
    conversationId: string,
    patientId: string,
  ): Promise<{ set: boolean; discrepancy: boolean }> {
    const conv = await this.prisma.conversations.findUnique({
      where: { id: conversationId },
      select: { patient_id: true },
    });
    if (!conv) return { set: false, discrepancy: false };
    if (conv.patient_id === null) {
      await this.prisma.runAsBot(this.botActorId, (tx) =>
        tx.conversations.update({
          where: { id: conversationId },
          data: { patient_id: patientId },
        }),
      );
      return { set: true, discrepancy: false };
    }
    if (conv.patient_id !== patientId) {
      this.logger.warn(
        `Discrepancia de identidad en conversación ${conversationId}: ` +
          `${conv.patient_id} ≠ ${patientId}.`,
      );
      return { set: false, discrepancy: true };
    }
    return { set: false, discrepancy: false };
  }

  /** G2 — marca la conversación derivada a humano. */
  async markHandedOff(conversationId: string): Promise<void> {
    await this.prisma.runAsBot(this.botActorId, (tx) =>
      tx.conversations.update({
        where: { id: conversationId },
        data: { status: 'handed_off' },
      }),
    );
  }

  /** Datos de la clínica para el system prompt. */
  async clinicPromptContext(
    clinicId: string,
  ): Promise<{ name: string; timezone: string } | null> {
    return this.prisma.clinics.findFirst({
      where: { id: clinicId, deleted_at: null },
      select: { name: true, timezone: true },
    });
  }
}
