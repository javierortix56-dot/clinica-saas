import { NestFactory } from '@nestjs/core';
import {
  ExpressAdapter,
  NestExpressApplication,
} from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // Adapter Express explícito: en el monorepo con workspaces, @nestjs/core puede
  // quedar hoisteado en el node_modules del root mientras platform-express queda
  // anidado en backend/node_modules. La autodetección dinámica de NestFactory
  // (loadPackage desde la ubicación de @nestjs/core) no encuentra el paquete y
  // falla con "No driver (HTTP) has been selected". Importarlo y pasarlo explícito
  // resuelve el require desde este archivo (backend) y evita la autodetección.
  //
  // rawBody: true => Nest preserva el cuerpo crudo (req.rawBody) además del
  // JSON parseado. Es imprescindible para validar la firma X-Hub-Signature-256
  // de los webhooks de WhatsApp (HMAC sobre los bytes EXACTOS, no el re-serializado).
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(),
    { rawBody: true },
  );
  // Headers de seguridad HTTP. API pura (sin HTML propio): CSP no aplica.
  app.use(helmet({ contentSecurityPolicy: false }));

  // Railway corre detrás de un proxy: sin esto, el rate limiting por IP vería
  // la IP del proxy para todos los requests (un solo bucket global).
  app.set('trust proxy', 1);

  // Cierre limpio en redeploys: deja terminar los jobs BullMQ en curso y
  // desconecta Prisma/Redis (hooks onModuleDestroy de los servicios).
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
}

void bootstrap();
