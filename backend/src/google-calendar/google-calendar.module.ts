import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VaultService } from './vault.service';
import { GoogleCalendarOAuthService } from './google-calendar-oauth.service';
import { GoogleCalendarEventService } from './google-calendar-event.service';
import { GoogleCalendarImportService } from './google-calendar-import.service';
import { GoogleCalendarSyncScheduler } from './google-calendar-sync.scheduler';
import { GoogleCalendarController } from './google-calendar.controller';

@Module({
  imports: [AuthModule],
  controllers: [GoogleCalendarController],
  providers: [
    VaultService,
    GoogleCalendarOAuthService,
    GoogleCalendarEventService,
    GoogleCalendarImportService,
    GoogleCalendarSyncScheduler,
  ],
  exports: [GoogleCalendarEventService, GoogleCalendarOAuthService],
})
export class GoogleCalendarModule {}
