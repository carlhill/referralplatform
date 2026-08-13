import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { COMPLIANCE_FLAG_CATEGORIES, type ComplianceFlagCategory } from '../compliance-rule-types';

const JURISDICTIONS = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT', 'ALL'];
const TRIGGER_CONDITIONS = ['patient_is_minor', 'dv_indicated', 'complex_case_flag'];

/** Body of `POST /compliance-rules` — publishes a new rule version. Internal-staff only. */
export class CreateComplianceRuleDto {
  @IsIn(COMPLIANCE_FLAG_CATEGORIES)
  category!: ComplianceFlagCategory;

  @IsIn(JURISDICTIONS)
  jurisdiction!: string;

  @IsString()
  @MinLength(1)
  version!: string;

  @IsIn(TRIGGER_CONDITIONS)
  triggerCondition!: string;

  @IsString()
  @MinLength(1)
  checklistText!: string;

  @IsOptional()
  @IsBoolean()
  requiresWwcc?: boolean;

  @IsOptional()
  @IsBoolean()
  exemptForAhpraRegistered?: boolean;
}
