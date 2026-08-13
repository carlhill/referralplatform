import { IsIn, IsOptional, IsString } from 'class-validator';
import { CASE_STATUSES } from '../case-status';

export class ListCasesQueryDto {
  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsString()
  specialistId?: string;

  @IsOptional()
  @IsIn(CASE_STATUSES)
  status?: string;
}
