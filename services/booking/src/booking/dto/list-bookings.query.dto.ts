import { IsIn, IsOptional, IsString } from 'class-validator';

const STATUSES = ['preference_captured', 'waitlisted', 'confirmed', 'cancelled', 'completed'];

export class ListBookingsQueryDto {
  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsString()
  specialistId?: string;

  @IsOptional()
  @IsString()
  referralId?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: string;
}
