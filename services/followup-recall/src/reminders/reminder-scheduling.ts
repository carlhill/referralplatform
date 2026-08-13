import type { ReminderChannel, ReminderRecipientType } from '../follow-up-plans/follow-up-plan-status';

export interface ScheduledReminderInput {
  recipientType: ReminderRecipientType;
  channel: ReminderChannel;
  scheduledFor: Date;
  escalationLevel: number;
}

/** Never schedule a reminder in the past relative to `now` — clamps to `now` instead. */
function notBefore(date: Date, now: Date): Date {
  return date.getTime() < now.getTime() ? now : date;
}

function daysBefore(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

function daysAfter(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * The normal (non-escalated, `escalationLevel: 0`) pre-due-date reminder
 * cadence for a freshly-created Follow-up Plan — business-process-flow.md
 * module 6: "Platform schedules reminders (patient, carer, GP recall
 * system)" plus "GP notified to give a courtesy call ~1 month before due
 * date". Multi-channel by design (sms/email/push across the run-up, plus a
 * secure-message GP courtesy-call nudge) so a single missed channel doesn't
 * mean a missed reminder.
 *
 * If a plan is created less than 30 days before its due date (a short or
 * urgent follow-up window), the earlier reminders would fall in the past —
 * `notBefore` clamps every one of them to fire at/near plan-creation time
 * instead of silently dropping them, so a short-window plan still gets a
 * full reminder burst rather than none at all. This is a documented
 * judgment call — see BUILD_LOG/followup-recall.md.
 */
export function computeInitialReminderSchedule(nextReviewDueAt: Date, now: Date): ScheduledReminderInput[] {
  return [
    {
      recipientType: 'gp',
      channel: 'secure_message',
      scheduledFor: notBefore(daysBefore(nextReviewDueAt, 30), now),
      escalationLevel: 0,
    },
    {
      recipientType: 'patient',
      channel: 'sms',
      scheduledFor: notBefore(daysBefore(nextReviewDueAt, 14), now),
      escalationLevel: 0,
    },
    {
      recipientType: 'patient',
      channel: 'email',
      scheduledFor: notBefore(daysBefore(nextReviewDueAt, 7), now),
      escalationLevel: 0,
    },
    {
      recipientType: 'patient',
      channel: 'push',
      scheduledFor: notBefore(daysBefore(nextReviewDueAt, 1), now),
      escalationLevel: 0,
    },
  ];
}

/**
 * Escalation cadence, in days after the due date, indexed by escalation
 * level (1-indexed: `ESCALATION_OFFSETS_DAYS[0]` is level 1's offset).
 * Levels 1-6 are hand-tuned (immediate, then 3/7/14/28/42 days after due
 * date — increasingly urgent but not so frequent it becomes noise); beyond
 * level 6 the cadence settles into a flat 14-day repeat indefinitely.
 * `modules-and-requirements.md` doesn't specify exact timings for
 * "escalating reminders if nothing detected near due date" — this is a
 * documented, reasonable judgment call, not a value taken from a spec.
 */
export const ESCALATION_OFFSETS_DAYS = [0, 3, 7, 14, 28, 42];

export function escalationOffsetDays(level: number): number {
  if (level < 1) {
    throw new Error(`escalation level must be >= 1, got ${level}`);
  }
  if (level <= ESCALATION_OFFSETS_DAYS.length) {
    return ESCALATION_OFFSETS_DAYS[level - 1];
  }
  const extraLevels = level - ESCALATION_OFFSETS_DAYS.length;
  return ESCALATION_OFFSETS_DAYS[ESCALATION_OFFSETS_DAYS.length - 1] + extraLevels * 14;
}

/**
 * One escalation "wave" at the given level — business-process-flow.md
 * module 6: "Not detected near due date -> Escalating reminder to patient +
 * GP". Always both recipients together (unlike the normal cadence, which
 * fans a single reminder across channels over time) because by the time
 * escalation is warranted, the GP needs visibility too, not just the
 * patient.
 */
export function computeEscalationReminders(
  nextReviewDueAt: Date,
  level: number,
  now: Date,
): ScheduledReminderInput[] {
  const scheduledFor = notBefore(daysAfter(nextReviewDueAt, escalationOffsetDays(level)), now);
  return [
    { recipientType: 'patient', channel: 'sms', scheduledFor, escalationLevel: level },
    { recipientType: 'gp', channel: 'secure_message', scheduledFor, escalationLevel: level },
  ];
}
