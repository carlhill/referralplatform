import { FollowUpPlanId, GPId, ISODateTimeString, PatientId, ReferralId } from './common';

export type FollowUpTestDetectionMethod = 'pathology_e_result' | 'my_health_record' | 'patient_self_report';

export type FollowUpPlanStatus = 'active' | 'completed' | 'suppressed_deceased' | 'superseded_by_new_referral';

/**
 * The specialist's structured Follow-up Plan (module 6). Reminder suppression on
 * the deceased-patient trigger must be immediate and must apply to
 * already-scheduled-but-not-yet-sent reminders, not just future ones — see
 * modules-and-requirements.md, Follow-up & Recall functional requirements.
 */
export interface FollowUpPlan {
  id: FollowUpPlanId;
  referralId: ReferralId;
  patientId: PatientId;
  gpId: GPId;
  status: FollowUpPlanStatus;
  nextReviewDueAt: ISODateTimeString;
  requiredTests: string[];
  /** Whether the referral this plan follows from is indefinite (ongoing) or needs re-creation. */
  indefiniteReferralApplies: boolean;
  testCompletionDetectedVia?: FollowUpTestDetectionMethod;
  testCompletedAt?: ISODateTimeString;
  /** Reminders already scheduled but not yet sent — cleared immediately by the deceased-patient trigger. */
  scheduledReminderIds: string[];
  /** GP notified to give a courtesy call ~1 month before due date, per business-process-flow.md module 6. */
  gpCourtesyCallDueAt?: ISODateTimeString;
  gpCourtesyCallCompletedAt?: ISODateTimeString;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}
