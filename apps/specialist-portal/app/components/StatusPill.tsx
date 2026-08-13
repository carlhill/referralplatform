import { StatusBadge, type StatusTone } from '@referralplatform/ui-components';

/**
 * Maps every status vocabulary this app renders (Referral, ReferralCase,
 * Booking, FollowUpPlan) onto `StatusBadge`'s four tones — status is never
 * conveyed by colour alone, per claude/ui-design.md (WCAG + this patient
 * population skewing older): every tone here still pairs an icon and a
 * plain-language label via `StatusBadge`, this map only decides which.
 */
const TONE_BY_STATUS: Record<string, StatusTone> = {
  // Referral (services/referral)
  queued: 'attention',
  lapsed: 'urgent',
  routed: 'attention',
  declined: 'urgent',
  booked: 'success',
  in_review: 'attention',
  resolved_econsult: 'success',
  completed: 'success',
  cancelled: 'neutral',
  // ReferralCase (services/specialist-review)
  received: 'attention',
  extracted: 'attention',
  extraction_confirmed: 'attention',
  full_appointment: 'success',
  // Booking (services/booking)
  preference_captured: 'attention',
  waitlisted: 'attention',
  confirmed: 'success',
  // FollowUpPlan (services/followup-recall)
  active: 'attention',
  suppressed_deceased: 'neutral',
  superseded_by_new_referral: 'neutral',
};

const LABEL_OVERRIDES: Record<string, string> = {
  in_review: 'In review',
  extraction_confirmed: 'Extraction confirmed',
  resolved_econsult: 'Resolved — eConsult',
  full_appointment: 'Full appointment',
  preference_captured: 'Awaiting slot match',
  suppressed_deceased: 'Suppressed (deceased)',
  superseded_by_new_referral: 'Superseded',
  pending_review: 'Pending review',
};

function humanize(status: string): string {
  return LABEL_OVERRIDES[status] ?? status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function StatusPill({ status }: { status: string }) {
  return <StatusBadge tone={TONE_BY_STATUS[status] ?? 'neutral'} label={humanize(status)} />;
}
