import type { Referral, ReferralStatus } from '@referralplatform/shared-types';
import { apiFetch } from './http';

/**
 * Client for the Referral Service (services/referral, port 3005). This app
 * uses it for the earliest-stage decision on a `routed` referral (decline
 * as inappropriate) — see `app/queue/referral/[referralId]/page.tsx`'s doc
 * comment for exactly how this reconciles with the Specialist Review
 * Service's own, later-stage case/branch-decision flow.
 *
 * Documented gap: `docker-compose.yml`'s `specialist-portal:` block does
 * not set `NEXT_PUBLIC_REFERRAL_SERVICE_URL` (root-level file, out of this
 * app's scope to edit — see root CONVENTIONS.md). Falls back to
 * `http://localhost:3005`, the port every other service's `.env.example`
 * already documents for the Referral Service, so this still works once
 * that line is added.
 */
const BASE_URL = process.env.NEXT_PUBLIC_REFERRAL_SERVICE_URL ?? 'http://localhost:3005';

export function listReferrals(
  accessToken: string | null,
  filters: { patientId?: string; gpId?: string; status?: ReferralStatus } = {},
): Promise<Referral[]> {
  return apiFetch<Referral[]>(BASE_URL, '/referrals', { accessToken, query: filters });
}

export function getReferral(accessToken: string | null, id: string): Promise<Referral> {
  return apiFetch<Referral>(BASE_URL, `/referrals/${id}`, { accessToken });
}

/** Specialist declines the referral as inappropriate — only valid while the referral is still `routed` (not yet booked). */
export function declineReferral(accessToken: string | null, id: string, reason?: string): Promise<Referral> {
  return apiFetch<Referral>(BASE_URL, `/referrals/${id}/decline`, { accessToken, method: 'POST', body: { reason } });
}
