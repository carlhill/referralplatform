import { ConsentRecordId, ISODateTimeString, PatientId } from './common';
import { SensitiveCategory } from './patient';

export type ConsentSubjectType = 'gp_link' | 'carer_delegate' | 'sensitive_category_access' | 'referral_visibility';

/**
 * The consent/security page's living audit trail — every grant, elevation, and
 * revocation is timestamped and immutable, per identity-security-recommendations.md
 * ("Privacy and data architecture") and business-process-flow.md module 7.
 * A ConsentRecord is written to Postgres by the Consent & Security Service *and*
 * mirrored to the Audit Log Service (via packages/audit-client) in the same
 * transactional boundary — see audit-log-architecture-decision.md.
 */
export interface ConsentRecord {
  id: ConsentRecordId;
  patientId: PatientId;
  subjectType: ConsentSubjectType;
  /** The GP id, carer id, or referral id this consent record applies to, depending on subjectType. */
  subjectId: string;
  sensitiveCategory?: SensitiveCategory;
  grantedAt: ISODateTimeString;
  grantedByPrincipalId: string;
  revokedAt?: ISODateTimeString;
  revokedByPrincipalId?: string;
  /** Periodic re-attestation of carer/delegate relationships — see identity-security-recommendations.md section 3 step 7. */
  reattestedAt?: ISODateTimeString;
  nextReattestationDueAt?: ISODateTimeString;
}
