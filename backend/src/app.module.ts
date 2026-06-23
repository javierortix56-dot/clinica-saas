import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
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

@Module({
  imports: [
    // Infraestructura transversal
    ScheduleModule.forRoot(),
    ConfigModule,
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
})
export class AppModule {}
