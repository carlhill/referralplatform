import { config } from './config';
import { apiFetch } from './http';
import type { Concern, ConcernStatus, ConsentRecord, ConsentSubjectType, LinkedGp, SensitiveCategory } from './types';

const base = () => config.consentSecurityUrl;

// --- Consent page: linked GPs & practices --------------------------------

export function listLinkedGps(token: string, patientId: string): Promise<LinkedGp[]> {
  return apiFetch(base(), '/consent/linked-gps', { token, query: { patientId } });
}

export function revokeLinkedGp(token: string, id: string, reason?: string): Promise<LinkedGp> {
  return apiFetch(base(), `/consent/linked-gps/${id}/revoke`, { method: 'POST', token, body: { reason } });
}

// --- Consent records (carer delegate / sensitive category access) --------

export interface GrantConsentInput {
  patientId: string;
  subjectType: Exclude<ConsentSubjectType, 'referral_visibility'>;
  subjectId: string;
  sensitiveCategory?: SensitiveCategory;
}

export function grantConsent(token: string, input: GrantConsentInput): Promise<ConsentRecord> {
  return apiFetch(base(), '/consent-records', { method: 'POST', token, body: input });
}

export function revokeConsent(token: string, id: string): Promise<ConsentRecord> {
  return apiFetch(base(), `/consent-records/${id}/revoke`, { method: 'POST', token });
}

export function listConsentRecords(
  token: string,
  patientId: string,
  subjectType?: ConsentSubjectType,
): Promise<ConsentRecord[]> {
  return apiFetch(base(), '/consent-records', { token, query: { patientId, subjectType } });
}

// --- Per-referral visibility ----------------------------------------------

export function grantReferralVisibility(
  token: string,
  patientId: string,
  referralId: string,
  granteeId: string,
): Promise<ConsentRecord> {
  return apiFetch(base(), '/consent/referral-visibility', {
    method: 'POST',
    token,
    body: { patientId, referralId, granteeId },
  });
}

export function revokeReferralVisibility(
  token: string,
  patientId: string,
  referralId: string,
  granteeId: string,
): Promise<ConsentRecord> {
  return apiFetch(base(), '/consent/referral-visibility/revoke', {
    method: 'POST',
    token,
    body: { patientId, referralId, granteeId },
  });
}

export function listReferralVisibility(token: string, patientId: string, referralId: string): Promise<ConsentRecord[]> {
  return apiFetch(base(), '/consent/referral-visibility', { token, query: { patientId, referralId } });
}

// --- Raise a concern --------------------------------------------------------

export interface RaiseConcernInput {
  patientId: string;
  relatedReferralId?: string;
  summary: string;
  isAboutHowCareWasHandled: boolean;
  isAboutSomethingNotWorkingOnThePlatform: boolean;
  isAboutSomeoneSeeingSomethingTheyShouldnt: boolean;
  gpNotifiedId?: string;
}

export function raiseConcern(token: string, input: RaiseConcernInput): Promise<Concern> {
  return apiFetch(base(), '/concerns', { method: 'POST', token, body: input });
}

export function listConcerns(token: string, patientId: string, status?: ConcernStatus): Promise<Concern[]> {
  return apiFetch(base(), '/concerns', { token, query: { patientId, status } });
}

export function getConcern(token: string, id: string): Promise<Concern> {
  return apiFetch(base(), `/concerns/${id}`, { token });
}
