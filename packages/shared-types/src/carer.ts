import { CarerId, ISODateTimeString, PatientId } from './common';
import { RepresentativeTier } from './patient';

export type CarerRelationship =
  'parent_guardian' | 'adult_child' | 'spouse_partner' | 'professional_support_worker' | 'other';

/**
 * A carer/delegate account, per the redesigned onboarding flow in
 * identity-security-recommendations.md section 3. A carer authenticates as
 * themselves (their own mobile/email) wherever possible — never silently as
 * the patient — which is the single highest-value change recommended there.
 */
export interface Carer {
  id: CarerId;
  patientId: PatientId;
  givenName: string;
  familyName: string;
  email: string;
  emailVerifiedAt?: ISODateTimeString;
  relationship: CarerRelationship;
  tier: RepresentativeTier;
  /**
   * True when the carer has no mobile number independent of the patient's
   * (the "shared-channel household" case) — flagged internally as elevated
   * risk and defaults to nominated_delegate tier only, per section 3 step 6.
   */
  sharesPatientMobileNumber: boolean;
  /** Populated only when sharesPatientMobileNumber is false. */
  ownMobileNumber?: string;
  /**
   * Evidence reference (power of attorney, guardianship order, parental authority)
   * required to hold authorised_representative tier. Stored as a document-vault
   * reference, not inline — see identity-security-recommendations.md section 2.
   */
  authorisedRepresentativeEvidenceDocumentId?: string;
  /** Explicit consent to view referrals in the patient's hidden sensitive categories, if granted. */
  sensitiveCategoryAccessGrantedAt?: ISODateTimeString;
  /** Re-attestation cadence per Australian Privacy Principles — see section 3 step 7 and business-process-flow.md module 7. */
  lastReattestedAt?: ISODateTimeString;
  nextReattestationDueAt: ISODateTimeString;
  /**
   * Flags this carer for the organisational-carer review flow when the same
   * mobile/email repeatedly appears as carer across unrelated patients — see
   * identity-security-recommendations.md section 5 (aged-care bulk-carer pattern).
   */
  suspectedOrganisationalCarer: boolean;
  createdAt: ISODateTimeString;
  revokedAt?: ISODateTimeString;
}
