/**
 * Runtime-checkable mirror of shared-types' `ConsentSubjectType` union
 * (packages/shared-types/src/consent-record.ts) — `class-validator`'s
 * `@IsIn` needs a concrete array, not just a TS type. Keep in sync.
 */
export const CONSENT_SUBJECT_TYPES = [
  'gp_link',
  'carer_delegate',
  'sensitive_category_access',
  'referral_visibility',
] as const;
export type ConsentSubjectType = (typeof CONSENT_SUBJECT_TYPES)[number];

export const SENSITIVE_CATEGORIES = [
  'sexual_health',
  'mental_health',
  'reproductive_health',
  'drug_and_alcohol',
] as const;
export type SensitiveCategory = (typeof SENSITIVE_CATEGORIES)[number];

/**
 * Consent must be settable per-referral, not just account-wide (root
 * CONVENTIONS.md / claude/modules-and-requirements.md, "Consent & Security").
 * `ConsentRecord` (see prisma/schema.prisma) has a single `subjectId`
 * string, so referral-scoped visibility is modelled as a composite key —
 * documented judgment call, see BUILD_LOG/consent-security.md — rather than
 * adding a dedicated granteeId column that would only apply to one
 * subjectType out of four.
 */
export function referralVisibilitySubjectId(referralId: string, granteeId: string): string {
  return `${referralId}:${granteeId}`;
}

export function parseReferralVisibilitySubjectId(subjectId: string): { referralId: string; granteeId: string } | null {
  const idx = subjectId.indexOf(':');
  if (idx < 0) return null;
  return { referralId: subjectId.slice(0, idx), granteeId: subjectId.slice(idx + 1) };
}
