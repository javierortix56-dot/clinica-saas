import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { QueueModule } from './queue/queue.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { ConversationModule } from './conversation/conversation.module';
import { AiModule } from './ai/ai.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { PatientsModule } from './patients/patients.module';
import { CatalogModule } from './catalog/catalog.module';
import { WorkerModule } from './worker/worker.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { GoogleCalendarModule } from './google-calendar/google-calendar.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    // Infraestructura transversal
    ScheduleModule.forRoot(),
    // Rate limiting global por IP: red de seguridad contra abuso/fuerza bruta.
    // Los webhooks firmados (WhatsApp, Google Calendar) llevan @SkipThrottle —
    // su autenticidad la garantiza la firma, y Meta/Google pueden ráfagas.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ConfigModule,
    HealthModule,
    DatabaseModule,
    QueueModule,
    // Dominio
    WhatsappModule,
    ConversationModule,
    AiModule,
    SchedulingModule,
    PatientsModule,
    CatalogModule,
    AppointmentsModule,
    GoogleCalendarModule,
    // Worker (consumidor de la cola)
    WorkerModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
