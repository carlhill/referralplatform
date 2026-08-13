/**
 * Wire-shape types for backend JSON responses — deliberately separate from
 * `@referralplatform/shared-types`' domain interfaces, because those model
 * the *domain* shape (branded ids, `Date`-free ISO strings already assumed)
 * while these mirror exactly what each service's Prisma-backed controller
 * actually serializes over HTTP today (e.g. `consentGrants`/`practiceLocations`
 * as `unknown` JSON columns). Where the two agree, this simply narrows.
 */

export const AUSTRALIAN_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const;
export type AustralianState = (typeof AUSTRALIAN_STATES)[number];

export const REFERRAL_ORIGINS = ['gp_in_practice', 'gp_telehealth', 'patient_requested_urgent'] as const;
export type ReferralOrigin = (typeof REFERRAL_ORIGINS)[number];

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
  origin: ReferralOrigin;
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

export interface ComplianceRule {
  id: string;
  category: string;
  jurisdiction: string;
  version: string;
  triggerCondition: string;
  checklistText: string;
  requiresWwcc: boolean;
  exemptForAhpraRegistered: boolean;
  active: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
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

export interface GpAuthorisationCheck {
  authorised: boolean;
  status: GpLinkStatus | 'no_link';
  linkId?: string;
}

export interface DirectoryPracticeLocation {
  name: string;
  suburb: string;
  state: string;
  postcode: string;
}

export interface DirectoryEntry {
  id: string;
  specialistId: string | null;
  hpiI: string | null;
  source: string;
  selfRegisteredOverride: boolean;
  displayName: string;
  subspecialty: string;
  practiceLocations: DirectoryPracticeLocation[];
  consultingDays: string[];
  econsultOptIn: boolean;
  acceptsBookingsViaPlatform: boolean;
  lastSyncedAt: string | null;
  updatedAt: string;
}

export interface PathwaySuggestion {
  specialistType: string;
  subspecialty: string;
  pathwayUrl: string;
  confidence: number;
  source: string;
  matchingDirectoryEntries: DirectoryEntry[];
}

export type FollowUpPlanStatus = 'active' | 'completed' | 'suppressed_deceased' | 'superseded_by_new_referral';

export interface FollowUpPlan {
  id: string;
  referralId: string;
  patientId: string;
  gpId: string;
  status: FollowUpPlanStatus;
  referralType: string;
  nextReviewDueAt: string;
  requiredTests: string[];
  indefiniteReferralApplies: boolean;
  testCompletionDetectedVia: string | null;
  testCompletedAt: string | null;
  gpCourtesyCallDueAt: string | null;
  gpCourtesyCallCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
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

export interface DeceasedFlag {
  id: string;
  patientId: string;
  flaggedAt: string;
  flaggedByGpId: string;
  state: AustralianState;
  reason: string | null;
  freezeConfirmedAt: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export const INTEGRATION_TIERS = ['A', 'B', 'C'] as const;
export type IntegrationTier = (typeof INTEGRATION_TIERS)[number];

export interface GpPractice {
  id: string;
  practiceName: string;
  hpiO: string;
  contactEmail: string;
  state: AustralianState;
  integrationTier: IntegrationTier;
  verificationStatus: 'verified' | 'failed' | 'pending';
  complianceChecklistAcknowledgedAt: string | null;
  complianceChecklistAcknowledgedByName: string | null;
  complianceChecklistAcknowledgedByEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountActivationResult {
  activationRequestId: string;
  patientId: string;
  linkExpiresAt: string;
  queueExpiresAt: string;
}
