import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { WhatsappSignatureGuard } from './guards/whatsapp-signature.guard';

/**
 * WhatsappModule — webhook de Meta (GET verify + POST mensajes), verificación
 * de firma X-Hub-Signature-256 y cliente para enviar mensajes a la Cloud API.
 * Exporta WhatsappService para que el worker (paso 6) pueda responder al paciente.
 */
@Module({
  controllers: [WhatsappController],
  providers: [WhatsappService, WhatsappSignatureGuard],
  exports: [WhatsappService],
})
export class WhatsappModule {}
