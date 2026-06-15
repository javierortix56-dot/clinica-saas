import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { DelayedError, Job } from 'bullmq';
import {
  WHATSAPP_INCOMING_QUEUE,
  WhatsappIncomingJob,
} from '../queue/queue.constants';
import { RedisLockService } from '../queue/redis-lock.service';
import { ConversationService } from '../conversation/conversation.service';
import { SystemPromptService } from '../conversation/system-prompt.service';
import { ConversationLoopService } from '../ai/conversation-loop.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { ActorSource } from '../database/prisma.service';
import { LlmMessage } from '../ai/llm/llm-client.interface';
import { ToolName } from '../ai/tools/tool-declarations';

const CONCURRENCY = Number(process.env.QUEUE_CONCURRENCY ?? 5) || 5;

const FALLBACK_MESSAGE =
  'Estamos con una demora para responderte. En un momento te contactamos. ¡Gracias por tu paciencia!';
const HANDOFF_MESSAGE =
  'Te voy a derivar con una persona del equipo para ayudarte mejor. En breve te responden.';

/**
 * Worker de mensajes entrantes de WhatsApp (blueprint Paso 6 §5).
 *
 * Toda la orquestación vive acá (desacoplada del webhook — A3): mutex por
 * conversación (A4) → ruteo → conversación → dedup → historial → prompt → ctx →
 * loop → persistencia → patient_id → respuesta/handoff. Movible a `worker.ts` sin
 * refactor.
 */
@Processor(WHATSAPP_INCOMING_QUEUE, { concurrency: CONCURRENCY })
export class WhatsappIncomingProcessor extends WorkerHost {
  private readonly logger = new Logger(WhatsappIncomingProcessor.name);
  private readonly ttlMs: number;
  private readonly contentionDelayMs: number;
  private readonly botActorId: string;

  constructor(
    private readonly lock: RedisLockService,
    private readonly conversation: ConversationService,
    private readonly systemPrompt: SystemPromptService,
    private readonly loop: ConversationLoopService,
    private readonly whatsapp: WhatsappService,
    config: ConfigService,
  ) {
    super();
    this.ttlMs = Number(config.get<string>('QUEUE_LOCK_TTL_MS') ?? '120000');
    this.contentionDelayMs = Number(
      config.get<string>('QUEUE_CONTENTION_DELAY_MS') ?? '1000',
    );
    this.botActorId = config.getOrThrow<string>('BOT_ACTOR_ID');
  }

  async process(job: Job<WhatsappIncomingJob>, token?: string): Promise<void> {
    const { phoneNumberId, contactPhone } = job.data;
    const lockKey = `lock:wa:${phoneNumberId}:${contactPhone}`;
    const lockToken = randomUUID();

    // --- A4: mutex por conversación ---
    if (!(await this.lock.acquire(lockKey, lockToken, this.ttlMs))) {
      const deferrals = (job.data.deferrals ?? 0) + 1;
      // Tope: ~TTL/delay (+ margen). Con TTL como red ante worker muerto, el lock
      // se libera dentro de ~TTL y el job difiere hasta tomarlo. Si se supera,
      // algo anómalo: fallback y cerrar el job (no loop infinito).
      const cap = Math.ceil(this.ttlMs / this.contentionDelayMs) + 5;
      if (deferrals > cap) {
        this.logger.error(
          `Lock ${lockKey} no liberado tras ${deferrals} diferimientos; fallback.`,
        );
        await this.safeSend(contactPhone, FALLBACK_MESSAGE);
        return;
      }
      await job.updateData({ ...job.data, deferrals });
      await job.moveToDelayed(Date.now() + this.contentionDelayMs, token);
      throw new DelayedError(); // reencolado, sin consumir attempts
    }

    const stopHeartbeat = this.lock.startHeartbeat(lockKey, lockToken, this.ttlMs);
    try {
      await this.handle(job.data);
    } finally {
      stopHeartbeat();
      await this.lock.release(lockKey, lockToken);
    }
  }

  private async handle(data: WhatsappIncomingJob): Promise<void> {
    const { phoneNumberId, contactPhone, waMessageId, text } = data;

    // D1 — ruteo. Canal desconocido: no es transitorio, no reintentar.
    const routed = await this.conversation.route(phoneNumberId);
    if (!routed) {
      this.logger.warn(`phone_number_id desconocido: ${phoneNumberId}; descartado.`);
      return;
    }
    const clinicId = routed.clinicId;

    // B1 — dedup: si ya completamos este mensaje, no reprocesar.
    if (await this.conversation.isAlreadyProcessed(clinicId, waMessageId)) {
      this.logger.debug(`Mensaje ${waMessageId} ya procesado; se descarta.`);
      return;
    }

    // D2 — conversación + historial (excluye el mensaje actual, aún no persistido).
    const conv = await this.conversation.resolveConversation(clinicId, contactPhone);
    const history = await this.conversation.loadHistory(conv.id);

    // E1 — system prompt mínimo.
    const clinic = await this.conversation.clinicPromptContext(clinicId);
    if (!clinic) {
      this.logger.error(`Clínica ${clinicId} sin datos; se descarta.`);
      return;
    }
    const system = this.systemPrompt.build(clinic);

    // F1 — contexto del loop (clinic_id/actor server-side).
    const ctx = {
      conversationId: conv.id,
      clinicId,
      actor: { actorId: this.botActorId, source: ActorSource.WhatsappBot },
      patientId: conv.patient_id ?? undefined,
    };

    const result = await this.loop.runTurn({
      ctx,
      history,
      system,
      incomingMessage: text,
    });

    // D4 — persistir el turno completo (incluye el mensaje del usuario con wa_id).
    await this.conversation.persistTurn(
      clinicId,
      conv.id,
      result.newMessages,
      waMessageId,
    );

    // D5 — fijar patient_id en el primer match; discrepancia → handoff.
    const matchedPatientId = this.extractPatientId(result.newMessages);
    if (matchedPatientId) {
      const { discrepancy } = await this.conversation.setPatientIfUnset(
        conv.id,
        matchedPatientId,
      );
      if (discrepancy) {
        await this.conversation.markHandedOff(conv.id);
        await this.safeSend(contactPhone, HANDOFF_MESSAGE);
        return;
      }
    }

    // G1/G2 — responder o derivar.
    if (result.outcome === 'handoff') {
      await this.conversation.markHandedOff(conv.id);
      await this.safeSend(contactPhone, HANDOFF_MESSAGE);
      return;
    }
    await this.whatsapp.sendTextMessage(contactPhone, result.text);
  }

  /**
   * D5 — busca un patient_id en los resultados de `buscar_paciente_por_dni`
   * (match) o `registrar_paciente` dentro de los mensajes 'tool' del turno.
   */
  private extractPatientId(messages: LlmMessage[]): string | undefined {
    for (const m of messages) {
      if (m.role !== 'tool' || !m.content) continue;
      if (
        m.name !== ToolName.BuscarPacientePorDni &&
        m.name !== ToolName.RegistrarPaciente
      ) {
        continue;
      }
      try {
        const parsed = JSON.parse(m.content) as {
          ok?: boolean;
          data?: {
            found?: boolean;
            patient_id?: string;
            patient?: { patient_id?: string };
          };
        };
        if (!parsed.ok || !parsed.data) continue;
        const id = parsed.data.patient?.patient_id ?? parsed.data.patient_id;
        if (id) return id;
      } catch {
        // contenido no-JSON: ignorar
      }
    }
    return undefined;
  }

  /** A5 — tras agotar reintentos, fallback genérico al paciente. */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<WhatsappIncomingJob>, err: Error): Promise<void> {
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < attempts) return; // aún quedan reintentos
    this.logger.error(
      `Job ${job.id} agotó ${attempts} intentos: ${err?.message}; fallback al paciente.`,
    );
    await this.safeSend(job.data.contactPhone, FALLBACK_MESSAGE);
  }

  private async safeSend(to: string, body: string): Promise<void> {
    try {
      await this.whatsapp.sendTextMessage(to, body);
    } catch (err) {
      this.logger.error(`No se pudo enviar mensaje a ${to}: ${err}`);
    }
  }
}
