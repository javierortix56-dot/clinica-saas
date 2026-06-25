import { IsIn } from 'class-validator';

export class UpdateAppointmentStatusDto {
  @IsIn(['in_progress', 'completed', 'no_show'])
  status!: 'in_progress' | 'completed' | 'no_show';
}
