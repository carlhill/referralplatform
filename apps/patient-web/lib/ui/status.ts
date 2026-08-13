import type { StatusTone } from '@referralplatform/ui-components';
import type { BookingStatus, ConcernStatus, GpLinkStatus, ReferralStatus } from '../api/types';

const REFERRAL_STATUS_LABEL: Record<ReferralStatus, string> = {
  queued: 'Waiting for your account to finish setting up',
  lapsed: 'Expired — ask your GP to resend',
  routed: 'Sent to the specialist',
  declined: 'Declined by the specialist',
  booked: 'Appointment booked',
  in_review: 'Specialist is reviewing',
  resolved_econsult: 'Resolved without an appointment',
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
  pending_patient_approval: 'Waiting for your approval',
  approved: 'Approved',
  declined: 'You declined this',
  revoked: 'Revoked',
  expired: 'Expired — no response in time',
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

const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  preference_captured: 'Waiting for a matching slot',
  waitlisted: 'On the waitlist',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
};

const BOOKING_STATUS_TONE: Record<BookingStatus, StatusTone> = {
  preference_captured: 'attention',
  waitlisted: 'attention',
  confirmed: 'success',
  cancelled: 'neutral',
  completed: 'success',
};

export function bookingStatusDisplay(status: BookingStatus): { label: string; tone: StatusTone } {
  return { label: BOOKING_STATUS_LABEL[status] ?? status, tone: BOOKING_STATUS_TONE[status] ?? 'neutral' };
}

const CONCERN_STATUS_LABEL: Record<ConcernStatus, string> = {
  triaged: 'Received',
  routed: 'Sent to the right team',
  in_progress: 'Being looked into',
  resolved: 'Resolved',
  escalated_to_oaic: 'Escalated to the Privacy Commissioner',
};

const CONCERN_STATUS_TONE: Record<ConcernStatus, StatusTone> = {
  triaged: 'neutral',
  routed: 'attention',
  in_progress: 'attention',
  resolved: 'success',
  escalated_to_oaic: 'urgent',
};

export function concernStatusDisplay(status: ConcernStatus): { label: string; tone: StatusTone } {
  return { label: CONCERN_STATUS_LABEL[status] ?? status, tone: CONCERN_STATUS_TONE[status] ?? 'neutral' };
}
