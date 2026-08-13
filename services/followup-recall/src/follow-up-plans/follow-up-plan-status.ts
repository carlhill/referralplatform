/**
 * Mirrors packages/shared-types/src/followup-plan.ts's `FollowUpPlanStatus`
 * union exactly — kept as a runtime array here because class-validator
 * needs a concrete list to validate against, and FollowUpPlansService needs
 * a legible transition table (same pattern
 * services/referral/src/referral/referral-status.ts uses for
 * `ReferralStatus`).
 */
export const FOLLOW_UP_PLAN_STATUSES = [
  'active',
  'completed',
  'suppressed_deceased',
  'superseded_by_new_referral',
] as const;

export type FollowUpPlanStatus = (typeof FOLLOW_UP_PLAN_STATUSES)[number];

/**
 * What kind of follow-up this plan represents — business-process-flow.md
 * module 6's "referral type" field on the Follow-up Plan. Not in
 * packages/shared-types (that interface only has the boolean
 * `indefiniteReferralApplies`), so this is this service's own validated
 * vocabulary — kept narrow/enumerated rather than free text so reporting
 * and the escalation/courtesy-call logic can key off it meaningfully.
 */
export const FOLLOW_UP_REFERRAL_TYPES = [
  /** Same specialist reviews the patient again once results are in. */
  'specialist_review',
  /** GP manages the recall themselves; specialist involvement not required unless something's abnormal. */
  'gp_managed_recall',
  /** A specific pathology test needs rechecking (e.g. HbA1c, INR). */
  'pathology_recheck',
  /** A specific imaging study needs rechecking. */
  'imaging_recheck',
  /** Ongoing/indefinite monitoring with no fixed end — see `indefiniteReferralApplies`. */
  'indefinite_monitoring',
] as const;

export type FollowUpReferralType = (typeof FOLLOW_UP_REFERRAL_TYPES)[number];

/** patient | carer | gp — who a given Reminder targets. */
export const REMINDER_RECIPIENT_TYPES = ['patient', 'carer', 'gp'] as const;
export type ReminderRecipientType = (typeof REMINDER_RECIPIENT_TYPES)[number];

/** sms | email | push | secure_message — see reminders/reminder-channel-sender.ts. */
export const REMINDER_CHANNELS = ['sms', 'email', 'push', 'secure_message'] as const;
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];

export const REMINDER_STATUSES = ['scheduled', 'sent', 'suppressed', 'cancelled', 'failed'] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const TEST_COMPLETION_METHODS = ['pathology_e_result', 'my_health_record', 'patient_self_report'] as const;
export type TestCompletionMethod = (typeof TEST_COMPLETION_METHODS)[number];
