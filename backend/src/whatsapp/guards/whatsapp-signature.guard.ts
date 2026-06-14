import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Forma mínima del request que necesitamos (sin acoplar a los tipos de Express).
 * `rawBody` lo provee Nest cuando se crea la app con `{ rawBody: true }`.
 */
interface SignedRequest {
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer;
}

const SIGNATURE_HEADER = 'x-hub-signature-256';

/**
 * Valida la firma `X-Hub-Signature-256` de los webhooks de Meta:
 * sha256=HMAC_SHA256(app_secret, rawBody). Comparación en tiempo constante.
 *
 * Rechaza (401) si falta la cabecera, falta el cuerpo crudo, o la firma no coincide.
 */
@Injectable()
export class WhatsappSignatureGuard implements CanActivate {
  private readonly logger = new Logger(WhatsappSignatureGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<SignedRequest>();

    const rawHeader = req.headers[SIGNATURE_HEADER];
    const signature = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    if (!signature) {
      throw new UnauthorizedException(
        'Falta la cabecera X-Hub-Signature-256.',
      );
    }

    const rawBody = req.rawBody;
    if (!rawBody || rawBody.length === 0) {
      throw new UnauthorizedException(
        'No hay cuerpo crudo disponible para validar la firma.',
      );
    }

    const appSecret = this.config.getOrThrow<string>('WHATSAPP_APP_SECRET');
    const expected =
      'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex');

    const signatureBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);

    if (
      signatureBuf.length !== expectedBuf.length ||
      !timingSafeEqual(signatureBuf, expectedBuf)
    ) {
      this.logger.warn('Firma X-Hub-Signature-256 inválida; request rechazado.');
      throw new UnauthorizedException('Firma X-Hub-Signature-256 inválida.');
    }

    return true;
  }
}
