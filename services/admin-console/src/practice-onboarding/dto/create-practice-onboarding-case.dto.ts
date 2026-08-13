import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const AUSTRALIAN_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const;

/** Opens a new pre-registration lead — the pipeline's own record, not yet backed by an onboarding-account GpPractice. */
export class CreatePracticeOnboardingCaseDto {
  @IsString()
  @MinLength(1)
  practiceName!: string;

  @IsOptional()
  @IsString()
  phn?: string;

  @IsOptional()
  @IsIn(AUSTRALIAN_STATES)
  state?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
