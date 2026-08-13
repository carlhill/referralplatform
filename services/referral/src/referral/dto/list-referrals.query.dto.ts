import { IsIn, IsOptional, IsString } from 'class-validator';
import { REFERRAL_STATUSES, type ReferralStatus } from '../referral-status';

export class ListReferralsQueryDto {
  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsString()
  gpId?: string;

  @IsOptional()
  @IsIn(REFERRAL_STATUSES)
  status?: ReferralStatus;
}
