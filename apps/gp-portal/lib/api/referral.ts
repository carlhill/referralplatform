import { config } from './config';
import { apiFetch } from './http';
import type { ComplianceFlag, ComplianceRule, Referral, ReferralOrigin, ReferralWithFlags } from './types';

export interface CreateReferralInput {
  patientId: string;
  gpId: string;
  specialistId?: string;
  origin: ReferralOrigin;
  urgent?: boolean;
  reasonForReferral: string;
  gpState: string;
  patientIsMinor?: boolean;
  dvIndicated?: boolean;
  complexCase?: boolean;
  patientAccountActive?: boolean;
  consentGrants?: Array<{ granteeId: string }>;
}

export function createReferral(token: string, input: CreateReferralInput): Promise<ReferralWithFlags> {
  return apiFetch(config.referralUrl, '/referrals', { method: 'POST', token, body: input });
}

export function listReferrals(
  token: string,
  filter: { gpId?: string; patientId?: string; status?: string },
): Promise<Referral[]> {
  return apiFetch(config.referralUrl, '/referrals', { token, query: filter });
}

export function getReferral(token: string, id: string): Promise<Referral> {
  return apiFetch(config.referralUrl, `/referrals/${id}`, { token });
}

export function getComplianceFlags(token: string, referralId: string): Promise<ComplianceFlag[]> {
  return apiFetch(config.referralUrl, `/referrals/${referralId}/compliance-flags`, { token });
}

export function acknowledgeComplianceFlag(
  token: string,
  referralId: string,
  flagId: string,
  note?: string,
): Promise<ComplianceFlag> {
  return apiFetch(config.referralUrl, `/referrals/${referralId}/compliance-flags/${flagId}/acknowledge`, {
    method: 'POST',
    token,
    body: { note },
  });
}

export function cancelReferral(token: string, id: string, reason?: string): Promise<Referral> {
  return apiFetch(config.referralUrl, `/referrals/${id}/cancel`, { method: 'POST', token, body: { reason } });
}

export interface EvaluateComplianceInput {
  gpState: string;
  patientIsMinor?: boolean;
  dvIndicated?: boolean;
  complexCase?: boolean;
}

export function evaluateCompliance(token: string, input: EvaluateComplianceInput): Promise<{ matched: ComplianceRule[] }> {
  return apiFetch(config.referralUrl, '/compliance-rules/evaluate', { method: 'POST', token, body: input });
}
