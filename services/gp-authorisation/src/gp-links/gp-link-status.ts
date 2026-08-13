/**
 * Runtime-checkable mirror of shared-types' `GPLinkStatus` union — kept here
 * because `class-validator`'s `@IsIn` needs a concrete array, not just a TS
 * type (same pattern services/audit-log uses for AUDIT_EVENT_TYPES). Keep in
 * sync with `packages/shared-types/src/gp-link.ts`.
 */
export const GP_LINK_STATUSES = ['pending_patient_approval', 'approved', 'declined', 'revoked', 'expired'] as const;
export type GpLinkStatus = (typeof GP_LINK_STATUSES)[number];
