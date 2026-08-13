import type { AustralianState } from '@referralplatform/shared-types';

export const REQUESTER_RELATIONSHIPS = ['executor', 'administrator', 'immediate_family', 'coroner', 'other'] as const;
export type RequesterRelationship = (typeof REQUESTER_RELATIONSHIPS)[number];

/**
 * Decision *support* only — never an auto-approval. Access after death is
 * "a human-reviewed request, not self-service" per
 * complaints-continuity-deceased.md section 3 point 3; this function exists
 * so the reviewing staff member sees whether the request fits the default
 * state rule at a glance, not to bypass their review.
 *
 * Per that doc: "in Victoria and the ACT, only the executor or
 * administrator of the estate can request access; in NSW and other states,
 * immediate family can also request it ... The coroner has statutory access
 * during a death investigation."
 */
const EXECUTOR_ADMINISTRATOR_ONLY_STATES: AustralianState[] = ['VIC', 'ACT'];

export function isEligibleByDefaultStateRule(state: AustralianState, relationship: RequesterRelationship): boolean {
  if (relationship === 'coroner') return true;
  if (relationship === 'executor' || relationship === 'administrator') return true;
  if (relationship === 'immediate_family') {
    return !EXECUTOR_ADMINISTRATOR_ONLY_STATES.includes(state);
  }
  return false; // 'other' is never eligible by the default rule — always needs closer staff review
}
