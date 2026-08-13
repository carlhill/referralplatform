import { GPId, GPLinkId, HPIO, ISODateTimeString, PatientId } from './common';

export type GPLinkStatus = 'pending_patient_approval' | 'approved' | 'declined' | 'revoked' | 'expired';

/**
 * Links a GP to a patient's account. A patient can have multiple concurrently
 * linked GPs (regular GP, second practice, locum, interstate GP). Any GP not
 * already linked must get patient approval before creating a referral — module
 * 1B of business-process-flow.md.
 */
export interface GPLink {
  id: GPLinkId;
  patientId: PatientId;
  gpId: GPId;
  practiceHpiO: HPIO;
  status: GPLinkStatus;
  /** Push approval request sent to the patient's mobile app. */
  approvalRequestedAt: ISODateTimeString;
  /** Reuses the same 2-day window as account activation, per minors-multigp-exception-paths.md section 3. */
  approvalExpiresAt: ISODateTimeString;
  approvedAt?: ISODateTimeString;
  declinedAt?: ISODateTimeString;
  revokedAt?: ISODateTimeString;
  /** True if this link was created via the urgent-bypass escalation rather than standard approval. */
  urgentEscalation: boolean;
}
