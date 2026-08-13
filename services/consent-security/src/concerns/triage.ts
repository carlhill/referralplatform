import { BadRequestException } from '@nestjs/common';
import type { ConcernCategory, ConcernRoutingDestination } from '@referralplatform/shared-types';

/**
 * The "raise a concern" triage engine — complaints-continuity-deceased.md
 * section 1: "the UI asks plain-language questions, not 'select a
 * category'." The three fields below are exactly those plain-language
 * yes/no questions (see RaiseConcernDto for the wording shown to the user);
 * this function is the deterministic decision table behind them, never
 * exposed to the user as a category picker.
 *
 * Priority when more than one is answered yes: privacy/consent breach >
 * clinical care/conduct > platform/technical. Documented judgment call (see
 * BUILD_LOG/consent-security.md) — a privacy breach is treated as the most
 * urgent/severe category regardless of what else was flagged, since it may
 * involve an active, ongoing unauthorised-access situation.
 */
export interface TriageAnswers {
  isAboutHowCareWasHandled: boolean;
  isAboutSomethingNotWorkingOnThePlatform: boolean;
  isAboutSomeoneSeeingSomethingTheyShouldnt: boolean;
}

export interface TriageResult {
  category: ConcernCategory;
  routedTo: ConcernRoutingDestination;
}

export function triageConcern(answers: TriageAnswers): TriageResult {
  if (answers.isAboutSomeoneSeeingSomethingTheyShouldnt) {
    return { category: 'privacy_or_consent_breach', routedTo: 'privacy_officer' };
  }
  if (answers.isAboutHowCareWasHandled) {
    return { category: 'clinical_care_or_conduct', routedTo: 'ahpra_or_state_health_complaints_commissioner' };
  }
  if (answers.isAboutSomethingNotWorkingOnThePlatform) {
    return { category: 'platform_technical', routedTo: 'internal_platform_support' };
  }
  throw new BadRequestException(
    'At least one triage question must be answered yes — tell us what this concern is about before it can be routed',
  );
}
