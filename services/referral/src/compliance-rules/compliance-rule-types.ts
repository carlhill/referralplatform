import type { AustralianState } from '@referralplatform/shared-types';

export type ComplianceFlagCategory = 'child' | 'domestic_violence' | 'complex' | 'working_with_children_check';

export const COMPLIANCE_FLAG_CATEGORIES: ComplianceFlagCategory[] = [
  'child',
  'domestic_violence',
  'complex',
  'working_with_children_check',
];

/** A rule's jurisdiction is a specific state, or "ALL" for a nationally-applicable rule. */
export type RuleJurisdiction = AustralianState | 'ALL';

/**
 * What referral-creation input a rule reacts to. Kept as a small closed set
 * (not a free-text expression language) deliberately — the Compliance Rules
 * Engine needs to be data-driven for its *content* (jurisdiction, WWCC
 * applicability, checklist text, versioning) per
 * modules-and-requirements.md, not necessarily an arbitrary rules DSL; see
 * BUILD_LOG/referral.md for this judgment call.
 */
export type TriggerCondition = 'patient_is_minor' | 'dv_indicated' | 'complex_case_flag';

export interface ComplianceEvaluationInput {
  gpState: AustralianState;
  patientIsMinor: boolean;
  dvIndicated: boolean;
  complexCase: boolean;
}

export interface ComplianceRuleRecord {
  id: string;
  category: string;
  jurisdiction: string;
  version: string;
  triggerCondition: string;
  checklistText: string;
  requiresWwcc: boolean;
  exemptForAhpraRegistered: boolean;
  active: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
