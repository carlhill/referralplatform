import { IsBoolean, IsIn, IsOptional } from 'class-validator';

const STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

/**
 * Body of `POST /compliance-rules/evaluate` — a preview endpoint the GP
 * portal can call while drafting a referral (before submitting) to show
 * which compliance checklists will be presented, without creating a
 * referral yet. ReferralService's actual `create()` runs the same
 * evaluation for real when the referral is created.
 */
export class EvaluateComplianceDto {
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
}
