import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsappSignatureGuard } from './guards/whatsapp-signature.guard';
import { WhatsappService } from './whatsapp.service';

/**
 * Webhook de WhatsApp Cloud API. Una sola URL (`/webhooks/whatsapp`) sirve:
 *   GET  -> verificación del webhook (challenge de Meta).
 *   POST -> recepción de mensajes (firma validada por WhatsappSignatureGuard).
 */
@Controller('webhooks/whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly whatsapp: WhatsappService,
  ) {}

  /**
   * Verificación del webhook (Meta -> GET con hub.mode/hub.verify_token/hub.challenge).
   * Si el token coincide con WHATSAPP_VERIFY_TOKEN, se devuelve el challenge tal cual.
   */
  @Get()
  verify(@Query() query: Record<string, string>): string {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    const expected = this.config.getOrThrow<string>('WHATSAPP_VERIFY_TOKEN');

    if (mode === 'subscribe' && token === expected) {
      this.logger.log('Webhook de WhatsApp verificado correctamente por Meta.');
      return challenge;
    }

    this.logger.warn('Verificación de webhook fallida (mode/token inválidos).');
    throw new ForbiddenException('Verificación de webhook fallida.');
  }

  /**
   * Recepción de eventos. La firma X-Hub-Signature-256 se valida ANTES (guard).
   * Responde 200 inmediato; el procesamiento pesado (LLM + BD) irá a la cola
   * BullMQ en el paso 6.
   */
  @Post()
  @HttpCode(200)
  @UseGuards(WhatsappSignatureGuard)
  async receive(@Body() payload: unknown): Promise<{ status: string }> {
    await this.whatsapp.handleIncomingEvent(payload);
    return { status: 'received' };
  }
}
