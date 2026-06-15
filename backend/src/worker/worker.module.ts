import { Module } from '@nestjs/common';
import { ConversationModule } from '../conversation/conversation.module';
import { AiModule } from '../ai/ai.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { WhatsappIncomingProcessor } from './whatsapp-incoming.processor';

/**
 * WorkerModule — aloja el `WhatsappIncomingProcessor` (consumidor de la cola).
 * Importa los módulos que la orquestación necesita (conversación, IA, WhatsApp);
 * la cola y el lock vienen de `QueueModule` (global). Es el entrypoint movible a
 * un `worker.ts` en el futuro (blueprint Paso 6 §2 · A3).
 */
@Module({
  imports: [ConversationModule, AiModule, WhatsappModule],
  providers: [WhatsappIncomingProcessor],
})
export class WorkerModule {}
