import { ISODateString, ISODateTimeString, PatientId } from './common';

/**
 * Two-tier representative model borrowed from My Health Record's nominated/authorised
 * representative split — see identity-security-recommendations.md section 2.
 * A carer record (see carer.ts) references which tier it holds for a given patient.
 */
export type RepresentativeTier = 'nominated_delegate' | 'authorised_representative';

/**
 * Specialty categories a patient (or the platform, by default) can mark hidden from
 * delegates unless explicitly consented — the standard Australian health-privacy list.
 * See identity-security-recommendations.md section 4.
 */
export type SensitiveCategory = 'sexual_health' | 'mental_health' | 'reproductive_health' | 'drug_and_alcohol';

export type PatientAccountStatus =
  | 'pending_activation' // SMS link sent, not yet clicked / OTP not yet entered
  | 'active'
  | 'frozen_deceased' // GP flagged patient deceased — see complaints-continuity-deceased.md section 3
  | 'suspended'; // platform/support action, e.g. suspected fraud

export interface Patient {
  id: PatientId;
  /** Primary de-duplication key — never Medicare number or name/DOB alone. */
  ihi?: IHIReference;
  givenName: string;
  familyName: string;
  dateOfBirth: ISODateString;
  /** The mobile number the onboarding SMS link was sent to. May differ from a carer's own number. */
  mobileNumber: string;
  email?: string;
  medicareNumber?: string;
  /** True once the patient (not just an operator of the account) has been positively identified. */
  isMinor: boolean;
  /** Set only when isMinor is true — informs the transition-to-independent-account workflow at 18. */
  guardianCarerId?: string;
  status: PatientAccountStatus;
  /** Categories hidden from delegate-tier carers by default, per section 4 of identity-security-recommendations.md. */
  sensitiveCategoriesHiddenFromDelegates: SensitiveCategory[];
  /** Set by the GP-flags-deceased workflow. Never triggers crypto-shredding — see complaints-continuity-deceased.md section 3. */
  deceasedFlaggedAt?: ISODateTimeString;
  deceasedFlaggedByGpId?: string;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

/** Placeholder alias kept distinct from the branded common.IHI so this file has no import cycle surprises. */
export type IHIReference = string;

export interface AccountActivationRequest {
  patientId: PatientId;
  /** GP who triggered the new-account request (module 1 of the business process flow). */
  triggeringGpId: string;
  smsLinkSentAt: ISODateTimeString;
  smsLinkExpiresAt: ISODateTimeString;
  /** OTP is delivered by email for this build (no paid SMS provider) — see modules-and-requirements.md. */
  otpDeliveryChannel: 'email' | 'sms';
  otpVerifiedAt?: ISODateTimeString;
  /** Referral queued behind this activation lapses after 2 days if not completed. */
  queueExpiresAt: ISODateTimeString;
}
