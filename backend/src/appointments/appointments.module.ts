import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GoogleCalendarModule } from '../google-calendar/google-calendar.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { AppointmentRemindersService } from './appointment-reminders.service';

@Module({
  imports: [AuthModule, GoogleCalendarModule, WhatsappModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AppointmentRemindersService],
})
export class AppointmentsModule {}
