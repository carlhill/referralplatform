/**
 * Wire-shape types for backend JSON responses — deliberately separate from
 * `@referralplatform/shared-types` (see apps/gp-portal/lib/api/types.ts for
 * the same reasoning: these mirror what each service's Prisma-backed
 * controller actually serializes over HTTP today).
 */

export const AUSTRALIAN_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const;
export type AustralianState = (typeof AUSTRALIAN_STATES)[number];

export type ReferralStatus =
  | 'queued'
  | 'lapsed'
  | 'routed'
  | 'declined'
  | 'booked'
  | 'in_review'
  | 'resolved_econsult'
  | 'completed'
  | 'cancelled';

export interface ComplianceFlag {
  id: string;
  referralId: string;
  category: 'child' | 'domestic_violence' | 'complex' | 'working_with_children_check';
  jurisdiction: string;
  rulesetVersion: string;
  checklistPresentedAt: string;
  checklistAcknowledgedAt: string | null;
  acknowledgementNote: string | null;
  createdAt: string;
}

export interface Referral {
  id: string;
  patientId: string;
  gpId: string;
  specialistId: string | null;
  status: ReferralStatus;
  origin: 'gp_in_practice' | 'gp_telehealth' | 'patient_requested_urgent';
  urgent: boolean;
  reasonForReferral: string;
  aiStructuredSummary: unknown;
  gpState: AustralianState;
  patientIsMinor: boolean;
  dvIndicated: boolean;
  complexCase: boolean;
  consentGrants: Array<{ granteeId: string; grantedAt: string; revokedAt?: string }>;
  queueExpiresAt: string | null;
  lapsedAt: string | null;
  routedAt: string | null;
  declinedAt: string | null;
  declinedReason: string | null;
  bookedAt: string | null;
  reviewStartedAt: string | null;
  resolvedEconsultAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReferralWithFlags extends Referral {
  complianceFlags: ComplianceFlag[];
}

export type GpLinkStatus = 'pending_patient_approval' | 'approved' | 'declined' | 'revoked' | 'expired';

export interface GpLink {
  id: string;
  patientId: string;
  gpId: string;
  practiceHpiO: string;
  status: GpLinkStatus;
  approvalRequestedAt: string;
  approvalExpiresAt: string;
  approvedAt: string | null;
  declinedAt: string | null;
  revokedAt: string | null;
  urgentEscalation: boolean;
  urgentJustification: string | null;
}

export type ConsentSubjectType = 'gp_link' | 'carer_delegate' | 'sensitive_category_access' | 'referral_visibility';
export type SensitiveCategory = 'sexual_health' | 'mental_health' | 'reproductive_health' | 'drug_and_alcohol';

export interface ConsentRecord {
  id: string;
  patientId: string;
  subjectType: ConsentSubjectType;
  subjectId: string;
  sensitiveCategory: SensitiveCategory | null;
  grantedAt: string;
  grantedByPrincipalId: string;
  revokedAt: string | null;
  revokedByPrincipalId: string | null;
  reattestedAt: string | null;
  nextReattestationDueAt: string | null;
}

export interface LinkedGp {
  id: string;
  patientId: string;
  gpId: string;
  practiceHpiO: string;
  status: GpLinkStatus;
  approvedAt: string | null;
  revokedAt: string | null;
  urgentEscalation: boolean;
}

export type ConcernStatus = 'triaged' | 'routed' | 'in_progress' | 'resolved' | 'escalated_to_oaic';
export type ConcernRoutingDestination =
  'ahpra_or_state_health_complaints_commissioner' | 'internal_platform_support' | 'privacy_officer';

export interface Concern {
  id: string;
  patientId: string;
  relatedReferralId: string | null;
  category: 'clinical_care_or_conduct' | 'platform_technical' | 'privacy_or_consent_breach';
  routedTo: ConcernRoutingDestination;
  status: ConcernStatus;
  summary: string;
  gpNotifiedId: string | null;
  raisedAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export type BookingStatus = 'preference_captured' | 'waitlisted' | 'confirmed' | 'cancelled' | 'completed';

export interface Booking {
  id: string;
  referralId: string;
  patientId: string;
  specialistId: string;
  status: BookingStatus;
  urgentFastPath: boolean;
  preferredDayOfWeek: string | null;
  preferredTimeOfDay: 'morning' | 'afternoon' | 'evening' | null;
  confirmedSlotStartsAt: string | null;
  confirmedSlotEndsAt: string | null;
  slotVersion: number;
  waitlistedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  externalCalendarEventId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateSlot {
  slotId: string;
  startsAt: string;
  endsAt: string;
  score: number;
}

export interface MessageThread {
  id: string;
  referralId: string;
  subject: string | null;
  status: 'open' | 'resolved';
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadMessage {
  id: string;
  threadId: string;
  senderType: string;
  senderId: string;
  senderDisplayName: string | null;
  body: string;
  createdAt: string;
}

export interface Passkey {
  credentialId: string;
  createdAt: string;
  lastUsedAt: string | null;
  deviceLabel: string | null;
  aaguid: string | null;
}

export interface AccountActivationResult {
  activationRequestId: string;
  patientId: string;
  linkExpiresAt: string;
  queueExpiresAt: string;
}
