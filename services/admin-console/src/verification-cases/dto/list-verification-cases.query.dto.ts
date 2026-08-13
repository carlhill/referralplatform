import { IsIn, IsOptional } from 'class-validator';
import { VERIFICATION_CASE_STATUSES, VERIFICATION_CASE_TYPES } from '../verification-case-types';

export class ListVerificationCasesQueryDto {
  @IsOptional()
  @IsIn(VERIFICATION_CASE_STATUSES)
  status?: string;

  @IsOptional()
  @IsIn(VERIFICATION_CASE_TYPES)
  caseType?: string;
}
