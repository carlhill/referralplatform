import type { AustralianState } from '@referralplatform/shared-types';
import type { RuleJurisdiction, TriggerCondition } from './compliance-rule-types';

/** The ruleset version every seed row below ships as. Bump when the seed data itself changes. */
export const SEED_RULESET_VERSION = '1.0.0';

export interface SeedRule {
  category: 'child' | 'domestic_violence' | 'complex' | 'working_with_children_check';
  jurisdiction: RuleJurisdiction;
  version: string;
  triggerCondition: TriggerCondition;
  checklistText: string;
  requiresWwcc: boolean;
  exemptForAhpraRegistered: boolean;
}

/**
 * States where a GP must hold a Working with Children Check even though
 * they're AHPRA-registered — researched, real data, per
 * minors-multigp-exception-paths.md section 1: "NSW, Northern Territory,
 * South Australia, and Tasmania still require GPs to hold a WWCC."
 */
const WWCC_REQUIRED_STATES: AustralianState[] = ['NSW', 'NT', 'SA', 'TAS'];

/**
 * States that exempt an AHPRA-registered practitioner from the WWCC
 * requirement, per the same section: "Queensland, Victoria, Western
 * Australia, and the ACT do not require it for GPs in private practice" —
 * Queensland's legislation is the explicit citation given
 * ("a health practitioner registered with Ahpra is exempt ... when
 * ... carrying on a business as part of their functions as a registered
 * health practitioner").
 */
const WWCC_EXEMPT_STATES: AustralianState[] = ['QLD', 'VIC', 'WA', 'ACT'];

function wwccRule(state: AustralianState, required: boolean): SeedRule {
  return {
    category: 'working_with_children_check',
    jurisdiction: state,
    version: SEED_RULESET_VERSION,
    triggerCondition: 'patient_is_minor',
    requiresWwcc: required,
    exemptForAhpraRegistered: !required,
    checklistText: required
      ? `${state}: a Working with Children Check (WWCC) is required for a GP consulting a minor patient in this ` +
        `state, even though the GP is AHPRA-registered — this state has not adopted the AHPRA-registration ` +
        `exemption. Confirm the treating GP's WWCC is current before proceeding. Decision support only — this is ` +
        `not a legal certification; the GP/practice remains responsible for actual compliance.`
      : `${state}: AHPRA-registered GPs are exempt from the Working with Children Check requirement in this state ` +
        `when acting within their registered profession (AHPRA registration and the National Law's mandatory` +
        `-notification obligations are treated as an equivalent screening/accountability layer here). No WWCC ` +
        `action needed for this referral. Decision support only, not a legal certification.`,
  };
}

/**
 * The Compliance Rules Engine's seed data — real, versioned rule content
 * per modules-and-requirements.md's Compliance Rules Engine requirements
 * and minors-multigp-exception-paths.md. Applied idempotently at service
 * boot by ComplianceRulesService.seedDefaults() (upsert on the
 * (category, jurisdiction, version) unique key), and re-runnable via
 * `POST /compliance-rules/seed` (internal-staff only) for ops/recovery.
 */
export const SEED_RULES: SeedRule[] = [
  ...WWCC_REQUIRED_STATES.map((state) => wwccRule(state, true)),
  ...WWCC_EXEMPT_STATES.map((state) => wwccRule(state, false)),
  {
    category: 'child',
    jurisdiction: 'ALL',
    version: SEED_RULESET_VERSION,
    triggerCondition: 'patient_is_minor',
    requiresWwcc: false,
    exemptForAhpraRegistered: false,
    checklistText:
      "This referral is for a patient under 18. Review: is a parent/guardian consenting on the patient's behalf " +
      '(or does the minor have capacity to consent independently, per state guidance)? Consider whether a chaperone ' +
      'is appropriate for the consultation. Mandatory reporting obligations apply if child safety concerns arise. ' +
      'Decision support only, not a legal certification.',
  },
  {
    category: 'domestic_violence',
    jurisdiction: 'ALL',
    version: SEED_RULESET_VERSION,
    triggerCondition: 'dv_indicated',
    requiresWwcc: false,
    exemptForAhpraRegistered: false,
    checklistText:
      'Domestic violence indicators have been noted on this referral. Review: has patient safety been assessed ' +
      "(is it currently safe to send referral correspondence to the patient's home address/shared devices)? " +
      'Consider referral-visibility consent settings — the patient may want this referral hidden from a shared-' +
      'access GP or other linked account. Consider a warm handoff/safety-planning resource alongside the clinical ' +
      'referral. Decision support only, not a legal certification.',
  },
  {
    category: 'complex',
    jurisdiction: 'ALL',
    version: SEED_RULESET_VERSION,
    triggerCondition: 'complex_case_flag',
    requiresWwcc: false,
    exemptForAhpraRegistered: false,
    checklistText:
      'This referral has been flagged as a medically or socially complex case (e.g. multiple comorbidities, ' +
      'safeguarding concerns, or care coordination across multiple providers). Review: is all relevant history ' +
      'attached, and does the receiving specialist need to be made aware of other active referrals/providers for ' +
      'this patient? Decision support only, not a legal certification.',
  },
];
