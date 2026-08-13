import { config } from './config';
import { apiFetch } from './http';
import type { ComplianceFlag, Referral, ReferralStatus } from './types';

export function listReferrals(
  token: string,
  filter: { patientId?: string; status?: ReferralStatus },
): Promise<Referral[]> {
  return apiFetch(config.referralUrl, '/referrals', { token, query: filter });
}

export function getReferral(token: string, id: string): Promise<Referral> {
  return apiFetch(config.referralUrl, `/referrals/${id}`, { token });
}

export function getComplianceFlags(token: string, id: string): Promise<ComplianceFlag[]> {
  return apiFetch(config.referralUrl, `/referrals/${id}/compliance-flags`, { token });
}

export function cancelReferral(token: string, id: string, reason?: string): Promise<Referral> {
  return apiFetch(config.referralUrl, `/referrals/${id}/cancel`, { method: 'POST', token, body: { reason } });
}
