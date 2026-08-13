import { IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

const CARER_RELATIONSHIPS = [
  'parent_guardian',
  'adult_child',
  'spouse_partner',
  'professional_support_worker',
  'other',
] as const;

export class ScheduleReattestationDto {
  @IsString()
  @MinLength(1)
  carerId!: string;

  @IsString()
  @MinLength(1)
  patientId!: string;

  @IsIn(CARER_RELATIONSHIPS)
  relationship!: (typeof CARER_RELATIONSHIPS)[number];

  /** Days between re-attestations — defaults to 365 (annual), per identity-security-recommendations.md section 3 step 7. */
  @IsOptional()
  @IsInt()
  @Min(1)
  cadenceDays?: number;
}
