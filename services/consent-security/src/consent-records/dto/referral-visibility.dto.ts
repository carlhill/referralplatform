import { IsString, MinLength } from 'class-validator';

export class ReferralVisibilityDto {
  @IsString()
  @MinLength(1)
  patientId!: string;

  @IsString()
  @MinLength(1)
  referralId!: string;

  /** A GP id, specialist id, or the literal string 'all_linked_gps'. */
  @IsString()
  @MinLength(1)
  granteeId!: string;
}
