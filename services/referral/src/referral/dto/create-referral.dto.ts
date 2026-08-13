import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

const ORIGINS = ['gp_in_practice', 'gp_telehealth', 'patient_requested_urgent'];
const STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

export class ConsentGranteeDto {
  @IsString()
  @MinLength(1)
  granteeId!: string;
}

/**
 * Body of `POST /referrals`. `gpState` keys the Compliance Rules Engine's
 * jurisdiction-specific evaluation (WWCC + child/DV/complex), per
 * minors-multigp-exception-paths.md section 3 ("keyed to the treating GP's
 * state"). `patientIsMinor`/`dvIndicated`/`complexCase` are the GP/AI-
 * asserted inputs the rules engine reacts to — decision support only.
 *
 * `patientAccountActive` decides whether this referral enters the 2-day
 * activation queue or routes immediately — see referral.service.ts
 * `create()`'s doc comment for why this is a caller-supplied field rather
 * than a live lookup against the Onboarding & Account Service (that
 * service doesn't yet expose an account-status endpoint for other services
 * to call — a documented integration gap, see BUILD_LOG/referral.md).
 */
export class CreateReferralDto {
  @IsString()
  @MinLength(1)
  patientId!: string;

  @IsString()
  @MinLength(1)
  gpId!: string;

  @IsOptional()
  @IsString()
  specialistId?: string;

  @IsIn(ORIGINS)
  origin!: string;

  @IsOptional()
  @IsBoolean()
  urgent?: boolean;

  @IsString()
  @MinLength(1)
  reasonForReferral!: string;

  @IsIn(STATES)
  gpState!: string;

  @IsOptional()
  @IsBoolean()
  patientIsMinor?: boolean;

  @IsOptional()
  @IsBoolean()
  dvIndicated?: boolean;

  @IsOptional()
  @IsBoolean()
  complexCase?: boolean;

  /** Defaults to false (safest assumption: queue for the full 2-day window) when omitted. */
  @IsOptional()
  @IsBoolean()
  patientAccountActive?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ConsentGranteeDto)
  consentGrants?: ConsentGranteeDto[];

  /**
   * Skips the live GP-Authorisation-Service check (used for tests/ops, or
   * when the caller has already independently verified authorisation).
   * Never exposed in any UI — a deliberate escape hatch, not a normal
   * request field.
   */
  @IsOptional()
  @IsBoolean()
  skipGpAuthorisationCheck?: boolean;
}
