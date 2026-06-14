import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { ConversationModule } from './conversation/conversation.module';
import { AiModule } from './ai/ai.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { PatientsModule } from './patients/patients.module';
import { CatalogModule } from './catalog/catalog.module';

@Module({
  imports: [
    // Infraestructura transversal
    ConfigModule,
    DatabaseModule,
    // Dominio
    WhatsappModule,
    ConversationModule,
    AiModule,
    SchedulingModule,
    PatientsModule,
    CatalogModule,
  ],
})
export class AppModule {}
