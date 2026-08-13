import { apiFetch } from './http';

/**
 * Client for the Follow-up & Recall Service (services/followup-recall,
 * port 3009) — the specialist's structured Follow-up Plan (next review
 * date, required tests, referral type). See BUILD_LOG/followup-recall.md.
 *
 * Documented gap: `docker-compose.yml`'s `specialist-portal:` block does
 * not set `NEXT_PUBLIC_FOLLOWUP_RECALL_URL` — out of this app's scope to
 * edit that root-level file. Falls back to `http://localhost:3009`, that
 * service's own documented port.
 */
const BASE_URL = process.env.NEXT_PUBLIC_FOLLOWUP_RECALL_URL ?? 'http://localhost:3009';

/**
 * This service's own invented vocabulary (not in @referralplatform/shared-types
 * — see BUILD_LOG/followup-recall.md judgment call #2), mirrored here exactly.
 */
export type FollowUpReferralType =
  'specialist_review' | 'gp_managed_recall' | 'pathology_recheck' | 'imaging_recheck' | 'indefinite_monitoring';

export const FOLLOW_UP_REFERRAL_TYPES: FollowUpReferralType[] = [
  'specialist_review',
  'gp_managed_recall',
  'pathology_recheck',
  'imaging_recheck',
  'indefinite_monitoring',
];

export type FollowUpPlanStatus = 'active' | 'completed' | 'suppressed_deceased' | 'superseded_by_new_referral';

export interface FollowUpPlan {
  id: string;
  referralId: string;
  patientId: string;
  gpId: string;
  referralType: FollowUpReferralType;
  status: FollowUpPlanStatus;
  nextReviewDueAt: string;
  requiredTests: string[];
  indefiniteReferralApplies: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFollowUpPlanInput {
  referralId: string;
  patientId: string;
  gpId: string;
  referralType: FollowUpReferralType;
  nextReviewDueAt: string;
  requiredTests: string[];
  indefiniteReferralApplies?: boolean;
}

export function createFollowUpPlan(accessToken: string | null, input: CreateFollowUpPlanInput): Promise<FollowUpPlan> {
  return apiFetch<FollowUpPlan>(BASE_URL, '/follow-up-plans', { accessToken, method: 'POST', body: input });
}

export function getFollowUpPlan(accessToken: string | null, id: string): Promise<FollowUpPlan> {
  return apiFetch<FollowUpPlan>(BASE_URL, `/follow-up-plans/${id}`, { accessToken });
}

export function listFollowUpPlansForPatient(
  accessToken: string | null,
  patientId: string,
  status?: FollowUpPlanStatus,
): Promise<FollowUpPlan[]> {
  return apiFetch<FollowUpPlan[]>(BASE_URL, '/follow-up-plans', { accessToken, query: { patientId, status } });
}
