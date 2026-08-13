import type { StatusTone } from '@referralplatform/ui-components';
import type { ReferralStatus } from '../api/types';
import type { FollowUpPlanStatus } from '../api/types';
import type { GpLinkStatus } from '../api/types';

const REFERRAL_STATUS_LABEL: Record<ReferralStatus, string> = {
  queued: 'Queued (activation pending)',
  lapsed: 'Lapsed — no patient response',
  routed: 'Sent to specialist',
  declined: 'Declined by specialist',
  booked: 'Appointment booked',
  in_review: 'Specialist reviewing',
  resolved_econsult: 'Resolved — eConsult',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const REFERRAL_STATUS_TONE: Record<ReferralStatus, StatusTone> = {
  queued: 'attention',
  lapsed: 'urgent',
  routed: 'neutral',
  declined: 'urgent',
  booked: 'success',
  in_review: 'neutral',
  resolved_econsult: 'success',
  completed: 'success',
  cancelled: 'neutral',
};

export function referralStatusDisplay(status: ReferralStatus): { label: string; tone: StatusTone } {
  return { label: REFERRAL_STATUS_LABEL[status] ?? status, tone: REFERRAL_STATUS_TONE[status] ?? 'neutral' };
}

const GP_LINK_STATUS_LABEL: Record<GpLinkStatus, string> = {
  pending_patient_approval: 'Waiting on patient approval',
  approved: 'Approved',
  declined: 'Declined by patient',
  revoked: 'Revoked',
  expired: 'Expired — no response',
};

const GP_LINK_STATUS_TONE: Record<GpLinkStatus, StatusTone> = {
  pending_patient_approval: 'attention',
  approved: 'success',
  declined: 'urgent',
  revoked: 'urgent',
  expired: 'urgent',
};

export function gpLinkStatusDisplay(status: GpLinkStatus): { label: string; tone: StatusTone } {
  return { label: GP_LINK_STATUS_LABEL[status] ?? status, tone: GP_LINK_STATUS_TONE[status] ?? 'neutral' };
}

const FOLLOW_UP_STATUS_LABEL: Record<FollowUpPlanStatus, string> = {
  active: 'Active',
  completed: 'Completed',
  suppressed_deceased: 'Suppressed (deceased)',
  superseded_by_new_referral: 'Superseded by new referral',
};

const FOLLOW_UP_STATUS_TONE: Record<FollowUpPlanStatus, StatusTone> = {
  active: 'attention',
  completed: 'success',
  suppressed_deceased: 'neutral',
  superseded_by_new_referral: 'neutral',
};

export function followUpStatusDisplay(status: FollowUpPlanStatus): { label: string; tone: StatusTone } {
  return { label: FOLLOW_UP_STATUS_LABEL[status] ?? status, tone: FOLLOW_UP_STATUS_TONE[status] ?? 'neutral' };
}

/** Is this Follow-up Plan's next-review date overdue, and by how urgently? */
export function followUpUrgency(nextReviewDueAt: string, courtesyCallDueAt: string | null): StatusTone {
  const due = new Date(nextReviewDueAt).getTime();
  const now = Date.now();
  if (due < now) return 'urgent';
  const courtesyDue = courtesyCallDueAt ? new Date(courtesyCallDueAt).getTime() : null;
  if (courtesyDue !== null && courtesyDue < now) return 'attention';
  return 'neutral';
}
