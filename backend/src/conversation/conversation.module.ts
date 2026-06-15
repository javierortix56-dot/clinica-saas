import { Module } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { SystemPromptService } from './system-prompt.service';

/**
 * ConversationModule — gestiona `conversations` / `conversation_messages`,
 * enruta `phone_number_id → clinic_id`, carga/persiste el historial en formato
 * neutro y construye el system prompt. Lo consume el worker (Paso 6).
 */
@Module({
  providers: [ConversationService, SystemPromptService],
  exports: [ConversationService, SystemPromptService],
})
export class ConversationModule {}
