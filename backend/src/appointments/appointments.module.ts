import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

/**
 * AppointmentsModule — API HTTP de escritura de turnos para el staff.
 * PrismaService es global (DatabaseModule); AuthModule provee los guards.
 */
@Module({
  imports: [AuthModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}
