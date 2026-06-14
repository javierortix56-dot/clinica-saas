import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // rawBody: true => Nest preserva el cuerpo crudo (req.rawBody) además del
  // JSON parseado. Es imprescindible para validar la firma X-Hub-Signature-256
  // de los webhooks de WhatsApp (HMAC sobre los bytes EXACTOS, no el re-serializado).
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
}

void bootstrap();
