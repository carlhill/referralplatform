import { GPId, ISODateTimeString, PatientId, ReferralId, SpecialistId } from './common';

export type ReferralStatus =
  | 'queued' // in the 2-day activation queue (patient account still activating)
  | 'lapsed' // queue expired with no patient response
  | 'routed' // sent to specialist via secure messaging gateway
  | 'declined' // specialist declined as inappropriate
  | 'booked'
  | 'in_review' // specialist review in progress (module 5)
  | 'resolved_econsult' // resolved via async advice, no appointment needed
  | 'completed'
  | 'cancelled';

export type ReferralOrigin = 'gp_in_practice' | 'gp_telehealth' | 'patient_requested_urgent';

export interface ReferralConsentGrant {
  /** Which principal (GP id, specialist id, or "all_linked_gps") this consent grant applies to. */
  granteeId: string;
  grantedAt: ISODateTimeString;
  revokedAt?: ISODateTimeString;
}

/**
 * A referral. Consent is settable per-referral, not just account-wide — see
 * modules-and-requirements.md, Consent & Security functional requirements.
 * State must be fully auditable and resumable: a referral interrupted mid-queue
 * by an outage must be recoverable to a consistent state, never lost or duplicated.
 */
export interface Referral {
  id: ReferralId;
  patientId: PatientId;
  gpId: GPId;
  specialistId?: SpecialistId;
  status: ReferralStatus;
  origin: ReferralOrigin;
  /** Urgent fast-path flag — skips booking preference negotiation, offers earliest slot directly. */
  urgent: boolean;
  reasonForReferral: string;
  /** AI-assisted structured extraction output — always shown alongside the original text, never replacing it. */
  aiStructuredSummary?: Record<string, unknown>;
  complianceFlagIds: string[];
  consentGrants: ReferralConsentGrant[];
  /** Set when origin required the 2-day activation queue; null once routed or if the account was already active. */
  queueExpiresAt?: ISODateTimeString;
  lapsedAt?: ISODateTimeString;
  declinedReason?: string;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}
