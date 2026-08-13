import { IsOptional, IsString } from 'class-validator';

/** Body of POST /referrals/:id/compliance-flags/:flagId/acknowledge. */
export class AcknowledgeFlagDto {
  @IsOptional()
  @IsString()
  note?: string;
}
