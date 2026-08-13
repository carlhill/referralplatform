import type { AuditEventType } from '@referralplatform/shared-types';

/**
 * Mirrors packages/shared-types/src/referral.ts's `ReferralStatus` union
 * exactly — kept as a runtime array here because class-validator needs a
 * concrete list to validate against (the same pattern
 * services/audit-log/src/audit-events/dto/create-audit-event.dto.ts uses
 * for `AuditEventType`).
 *
 * NOTE: that shared union has no distinct "created" value, even though the
 * task brief describes the state machine as "created → queued → routed →
 * booked → reviewed → followed-up". This service treats referral creation
 * as an instantaneous event (audited as `referral.created`) that lands the
 * row directly in `queued` — see referral.service.ts `create()` and
 * BUILD_LOG/referral.md for the judgment call.
 */
export const REFERRAL_STATUSES = [
  'queued',
  'lapsed',
  'routed',
  'declined',
  'booked',
  'in_review',
  'resolved_econsult',
  'completed',
  'cancelled',
] as const;

export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

/** Terminal statuses — no further transition is ever valid once here. */
export const TERMINAL_STATUSES: ReferralStatus[] = [
  'lapsed',
  'declined',
  'resolved_econsult',
  'completed',
  'cancelled',
];

/**
 * The state machine's allowed-transition table — DATA, not a chain of
 * if-statements, so the valid graph is legible in one place and every
 * transition method (`ReferralService.transition()`) enforces it uniformly.
 * Matches business-process-flow.md's module 2/4/5/6 flow:
 *   queued -> routed | lapsed | cancelled
 *   routed -> booked | declined | cancelled
 *   booked -> in_review | cancelled
 *   in_review -> resolved_econsult | completed | cancelled
 * Everything else is terminal (see TERMINAL_STATUSES).
 */
export const ALLOWED_TRANSITIONS: Record<ReferralStatus, ReferralStatus[]> = {
  queued: ['routed', 'lapsed', 'cancelled'],
  lapsed: [],
  routed: ['booked', 'declined', 'cancelled'],
  declined: [],
  booked: ['in_review', 'cancelled'],
  in_review: ['resolved_econsult', 'completed', 'cancelled'],
  resolved_econsult: [],
  completed: [],
  cancelled: [],
};

export function isValidTransition(from: ReferralStatus, to: ReferralStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Maps a `ReferralStatus` transition to the `AuditEventType` written for
 * it. `packages/shared-types/src/audit-event.ts`'s `AuditEventType` union
 * has exact matches for queued/routed/lapsed/declined/cancelled, and
 * `booking.confirmed` is a reasonable exact-fit reuse for `booked` (a
 * booking really was just confirmed). It has **no** entry at all for
 * `in_review`/`resolved_econsult`/`completed` — those three reuse
 * `referral.routed` (the closest neighbor: "the referral has progressed
 * further along its post-routing lifecycle"), disambiguated via
 * `payload.actualStatus` on the outbox row, following the exact precedent
 * `services/gp-authorisation` set (see its BUILD_LOG.md) for a link-expiry
 * event with no dedicated type. Recommended real fix, out of this task's
 * scope (editing packages/shared-types): add `referral.booked`,
 * `referral.in_review`, `referral.resolved_econsult`, `referral.completed`
 * to that union and to
 * services/audit-log/src/audit-events/dto/create-audit-event.dto.ts's
 * `AUDIT_EVENT_TYPES` — see BUILD_LOG/referral.md.
 */
export function auditEventTypeForStatus(status: ReferralStatus): AuditEventType {
  switch (status) {
    case 'queued':
      return 'referral.queued';
    case 'routed':
      return 'referral.routed';
    case 'lapsed':
      return 'referral.lapsed';
    case 'declined':
      return 'referral.declined';
    case 'cancelled':
      return 'referral.cancelled';
    case 'booked':
      return 'booking.confirmed';
    case 'in_review':
    case 'resolved_econsult':
    case 'completed':
      return 'referral.routed';
  }
}
