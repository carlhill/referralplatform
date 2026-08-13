/**
 * The AHPRA/WWCC manual verification queue's own vocabulary — kept as a
 * single source of truth for both the Prisma-shaped record type and the
 * runtime-checkable lists class-validator's DTOs need (a TS union alone
 * can't validate a request body at runtime).
 *
 * `caseType`:
 *  - `ahpra_specialist` — a specialist's AHPRA registration the automated
 *    check in onboarding-account flagged (or a support ticket raised).
 *  - `gp_practice_hpio` — a GP practice's HPI-O verification, same trigger.
 *  - `wwcc` — Working With Children Check. There is no automated national
 *    WWCC check (each state runs its own portal/register) — see
 *    minors-multigp-exception-paths.md, which recommends exactly this:
 *    capture the check number + issuing state, and manually verify against
 *    that state's own portal. A `wwcc` case therefore has no
 *    `entityType`/`entityId` in onboarding-account to snapshot from
 *    (`refresh()` is a no-op for this caseType — see the service).
 */
export const VERIFICATION_CASE_TYPES = ['ahpra_specialist', 'gp_practice_hpio', 'wwcc'] as const;
export type VerificationCaseType = (typeof VERIFICATION_CASE_TYPES)[number];

/**
 * `open` — awaiting staff review (initial state, and the state `refresh()`
 *   leaves it in — refreshing never itself changes status).
 * `needs_info` — staff asked for more from whoever raised the case; not a
 *   terminal state, can move back to `open` implicitly by being decided.
 * `approved` / `rejected` — terminal. Once decided, `decide()` refuses a
 *   second decision (ConflictException) — mirrors
 *   consent-security's AccessRequestsService.decide() pattern exactly.
 */
export const VERIFICATION_CASE_STATUSES = ['open', 'needs_info', 'approved', 'rejected'] as const;
export type VerificationCaseStatus = (typeof VERIFICATION_CASE_STATUSES)[number];

export interface VerificationCaseRecord {
  id: string;
  caseType: string;
  entityType: string | null;
  entityId: string | null;
  subjectName: string;
  subjectIdentifier: string | null;
  issuingState: string | null;
  lastKnownAutomatedStatus: string | null;
  lastKnownAutomatedDetail: unknown;
  lastRefreshedAt: Date | null;
  status: string;
  assignedStaffId: string | null;
  notes: string | null;
  decisionNote: string | null;
  decidedByStaffId: string | null;
  decidedAt: Date | null;
  createdByStaffId: string;
  createdAt: Date;
  updatedAt: Date;
}
