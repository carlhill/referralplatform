/**
 * A ReferralCase's lifecycle — module 5 of business-process-flow.md:
 *
 *   received -> extracted -> extraction_confirmed -> (resolved_econsult | full_appointment) -> completed
 *
 * with `cancelled` reachable from any non-terminal state. `extracted` can
 * also loop back to itself (re-running extraction produces a new
 * ExtractionResult without changing case status) — that's handled in
 * CasesService directly rather than in this table, since it's a no-op
 * transition, not a state change.
 *
 * This is DATA, not a chain of if-statements, mirroring
 * services/referral/src/referral/referral-status.ts's ALLOWED_TRANSITIONS
 * pattern — the single legible source of truth CasesService's `transition()`
 * enforces against.
 */
export const CASE_STATUSES = [
  'received',
  'extracted',
  'extraction_confirmed',
  'resolved_econsult',
  'full_appointment',
  'completed',
  'cancelled',
] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

export const TERMINAL_CASE_STATUSES: CaseStatus[] = ['resolved_econsult', 'completed', 'cancelled'];
// Note: 'resolved_econsult' is listed as terminal for the branch-decision gate (you cannot re-decide the
// branch once eConsult advice has been given) but a case in that status can still move to 'completed'
// once the specialist formally closes it out — see ALLOWED_TRANSITIONS below, which is the actual
// enforcement source; this array is informational only for callers that want a quick terminal check.

export const ALLOWED_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  received: ['extracted', 'cancelled'],
  extracted: ['extraction_confirmed', 'cancelled'],
  extraction_confirmed: ['resolved_econsult', 'full_appointment', 'cancelled'],
  resolved_econsult: ['completed', 'cancelled'],
  full_appointment: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function isValidCaseTransition(from: CaseStatus, to: CaseStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
