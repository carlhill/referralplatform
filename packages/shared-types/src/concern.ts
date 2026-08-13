import { ConcernId, ISODateTimeString, PatientId } from './common';

/**
 * "Raise a concern" triage categories — see complaints-continuity-deceased.md
 * section 1. The UI asks plain-language questions, not a category picker; the
 * category below is the *result* of that triage, not user-facing copy.
 */
export type ConcernCategory = 'clinical_care_or_conduct' | 'platform_technical' | 'privacy_or_consent_breach';

export type ConcernRoutingDestination =
  'ahpra_or_state_health_complaints_commissioner' | 'internal_platform_support' | 'privacy_officer';

export type ConcernStatus = 'triaged' | 'routed' | 'in_progress' | 'resolved' | 'escalated_to_oaic';

export interface Concern {
  id: ConcernId;
  patientId: PatientId;
  /** The referral this concern relates to, if raised from a referral rather than the consent/security page. */
  relatedReferralId?: string;
  category: ConcernCategory;
  routedTo: ConcernRoutingDestination;
  status: ConcernStatus;
  summary: string;
  /** GP copied on clinical-care concerns, respecting the patient's existing consent settings. */
  gpNotifiedId?: string;
  raisedAt: ISODateTimeString;
  resolvedAt?: ISODateTimeString;
  resolutionNote?: string;
}
