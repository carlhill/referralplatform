import { AustralianState, ComplianceFlagId, ISODateTimeString, ReferralId } from './common';

export type ComplianceFlagCategory = 'child' | 'domestic_violence' | 'complex' | 'working_with_children_check';

/**
 * The compliance checklist is decision support only, never a legal certification
 * (practices formally acknowledge this at onboarding — see onboarding-processes.md).
 * Rules are versioned and state-keyed, stored as editable configuration in the
 * Compliance Rules Engine — never hardcoded conditionals in a service.
 */
export interface ComplianceFlag {
  id: ComplianceFlagId;
  referralId: ReferralId;
  category: ComplianceFlagCategory;
  /** State the rule was evaluated against — the treating GP's state, per minors-multigp-exception-paths.md section 3. */
  jurisdiction: AustralianState;
  /** Version of the rules-engine ruleset that produced this flag — referrals stay auditable against the rules active at the time. */
  rulesetVersion: string;
  checklistPresentedAt: ISODateTimeString;
  checklistAcknowledgedAt?: ISODateTimeString;
  /** Free-text note captured from the GP acknowledging the checklist, if any. */
  acknowledgementNote?: string;
}
