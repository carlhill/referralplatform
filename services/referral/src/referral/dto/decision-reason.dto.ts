import { IsOptional, IsString } from 'class-validator';

/** Body of POST /referrals/:id/decline and POST /referrals/:id/cancel. */
export class DecisionReasonDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
