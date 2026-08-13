import { apiFetch } from './http';

/**
 * Client for the Specialist Review Service (services/specialist-review,
 * port 3008) — AI-assisted structured extraction, the explicit-confirmation
 * gate, the eConsult/full-appointment branch decision, and pre-visit
 * pathology/imaging requests. See BUILD_LOG/specialist-review.md for the
 * service's own design rationale; types below mirror its
 * `prisma/schema.prisma` models exactly (that service has no npm package to
 * import types from, per root CONVENTIONS.md §4 — shared-types only covers
 * cross-service domain objects, not a single service's own internal
 * records).
 */
const BASE_URL = process.env.NEXT_PUBLIC_SPECIALIST_REVIEW_URL ?? 'http://localhost:3008';

export type CaseStatus =
  | 'received'
  | 'extracted'
  | 'extraction_confirmed'
  | 'resolved_econsult'
  | 'full_appointment'
  | 'completed'
  | 'cancelled';

export interface ReferralCase {
  id: string;
  referralId: string;
  patientId: string;
  gpId: string;
  specialistId?: string | null;
  urgent: boolean;
  referralText: string;
  reasonForReferralHint?: string | null;
  status: CaseStatus;
  receivedAt: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancelledReason?: string | null;
}

export interface ExtractionResult {
  id: string;
  caseId: string;
  providerName: string;
  structuredData: Record<string, unknown>;
  confidence?: number | null;
  status: 'pending_review' | 'confirmed' | 'superseded' | 'rejected';
  extractedAt: string;
  confirmedAt?: string | null;
  confirmedBySpecialistId?: string | null;
  specialistEdits?: Record<string, unknown> | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
}

export interface SpecialistDecision {
  id: string;
  caseId: string;
  branch: 'econsult' | 'full_appointment';
  adviceText?: string | null;
  notes?: string | null;
  specialistId: string;
  decidedAt: string;
  referralServiceSyncStatus: 'pending' | 'synced' | 'failed';
  referralServiceSyncError?: string | null;
}

export interface PathologyImagingRequest {
  id: string;
  caseId: string;
  requestType: 'pathology' | 'imaging';
  testsRequested: string[];
  clinicalNotes?: string | null;
  status: string;
  mockProviderReference?: string | null;
  requestedBySpecialistId: string;
  requestedAt: string;
}

export function listCases(
  accessToken: string | null,
  filters: { specialistId?: string; patientId?: string; status?: CaseStatus } = {},
): Promise<ReferralCase[]> {
  return apiFetch<ReferralCase[]>(BASE_URL, '/cases', { accessToken, query: filters });
}

export function getCase(accessToken: string | null, caseId: string): Promise<ReferralCase> {
  return apiFetch<ReferralCase>(BASE_URL, `/cases/${caseId}`, { accessToken });
}

export function listExtractions(accessToken: string | null, caseId: string): Promise<ExtractionResult[]> {
  return apiFetch<ExtractionResult[]>(BASE_URL, `/cases/${caseId}/extractions`, { accessToken });
}

/** Runs the pluggable ExtractionProvider (rule-based by default) — creates a `pending_review` ExtractionResult. Never auto-actions anything. */
export function runExtraction(
  accessToken: string | null,
  caseId: string,
  referralTextOverride?: string,
): Promise<ExtractionResult> {
  return apiFetch<ExtractionResult>(BASE_URL, `/cases/${caseId}/extract`, {
    accessToken,
    method: 'POST',
    body: referralTextOverride ? { referralTextOverride } : {},
  });
}

/** The explicit-confirmation gate — `confirmed: true` is the only accepted value. */
export function confirmExtraction(
  accessToken: string | null,
  caseId: string,
  extractionId: string,
  edits?: Record<string, unknown>,
  note?: string,
): Promise<ExtractionResult> {
  return apiFetch<ExtractionResult>(BASE_URL, `/cases/${caseId}/extractions/${extractionId}/confirm`, {
    accessToken,
    method: 'POST',
    body: { confirmed: true, edits, note },
  });
}

export function rejectExtraction(
  accessToken: string | null,
  caseId: string,
  extractionId: string,
  reason: string,
): Promise<ExtractionResult> {
  return apiFetch<ExtractionResult>(BASE_URL, `/cases/${caseId}/extractions/${extractionId}/reject`, {
    accessToken,
    method: 'POST',
    body: { reason },
  });
}

export function listDecisions(accessToken: string | null, caseId: string): Promise<SpecialistDecision[]> {
  return apiFetch<SpecialistDecision[]>(BASE_URL, `/cases/${caseId}/decisions`, { accessToken });
}

/** eConsult (async advice) vs. full appointment — requires a confirmed extraction. */
export function decideBranch(
  accessToken: string | null,
  caseId: string,
  branch: 'econsult' | 'full_appointment',
  adviceText?: string,
  notes?: string,
): Promise<SpecialistDecision> {
  return apiFetch<SpecialistDecision>(BASE_URL, `/cases/${caseId}/branch-decision`, {
    accessToken,
    method: 'POST',
    body: { branch, adviceText, notes },
  });
}

export function listPathologyRequests(accessToken: string | null, caseId: string): Promise<PathologyImagingRequest[]> {
  return apiFetch<PathologyImagingRequest[]>(BASE_URL, `/cases/${caseId}/pathology-requests`, { accessToken });
}

export function requestPathology(
  accessToken: string | null,
  caseId: string,
  requestType: 'pathology' | 'imaging',
  testsRequested: string[],
  clinicalNotes?: string,
): Promise<PathologyImagingRequest> {
  return apiFetch<PathologyImagingRequest>(BASE_URL, `/cases/${caseId}/pathology-requests`, {
    accessToken,
    method: 'POST',
    body: { requestType, testsRequested, clinicalNotes },
  });
}

export function completeCase(accessToken: string | null, caseId: string): Promise<ReferralCase> {
  return apiFetch<ReferralCase>(BASE_URL, `/cases/${caseId}/complete`, { accessToken, method: 'POST', body: {} });
}

export function cancelCase(accessToken: string | null, caseId: string, reason?: string): Promise<ReferralCase> {
  return apiFetch<ReferralCase>(BASE_URL, `/cases/${caseId}/cancel`, { accessToken, method: 'POST', body: { reason } });
}
