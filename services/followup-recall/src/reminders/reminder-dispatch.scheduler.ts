import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ConsentSecurityClient } from '../common/consent-security.client';
import { DeceasedSuppressionService, SYSTEM_ACTOR } from '../deceased-suppression/deceased-suppression.service';
import { MockReminderChannelSender, type ReminderChannelSender } from './reminder-channel-sender';
import type { ReminderChannel, ReminderRecipientType } from '../follow-up-plans/follow-up-plan-status';

interface DueReminderRow {
  id: string;
  followUpPlanId: string;
  patientId: string;
  recipientType: string;
  channel: string;
  escalationLevel: number;
  followUpPlan: { id: string; status: string; referralType: string; nextReviewDueAt: Date; requiredTests: string[] };
}

const BATCH_SIZE = 50;

function composeMessage(row: DueReminderRow): string {
  const tests = row.followUpPlan.requiredTests.join(', ') || 'the required follow-up';
  const due = row.followUpPlan.nextReviewDueAt.toISOString().slice(0, 10);
  if (row.escalationLevel > 0) {
    return row.recipientType === 'gp'
      ? `ESCALATION (level ${row.escalationLevel}): patient's follow-up (${tests}) was due ${due} and is still not marked complete. Please review/contact the patient.`
      : `Reminder: your follow-up (${tests}) was due ${due}. Please complete it or let us know it's already done.`;
  }
  return row.recipientType === 'gp'
    ? `Courtesy reminder: patient's follow-up (${tests}) is due ${due}. A courtesy call is suggested around now.`
    : `Reminder: your follow-up (${tests}) is due ${due}. Please book/complete it in time.`;
}

/**
 * Sends every reminder whose `scheduledFor` has arrived, for a plan that's
 * still `active` — status filtering at the query level is the first line
 * of defense against ever sending a reminder for a completed/suppressed
 * plan (both `FollowUpPlansService.recordTestCompletion` and
 * `DeceasedSuppressionService.suppressAllForPatient` already flip a
 * reminder's own `status` away from `scheduled` the moment the plan
 * changes, so this query alone would normally be enough).
 *
 * **Second line of defense**: right before actually sending, does a live
 * per-patient check against the Consent & Security Service
 * (`ConsentSecurityClient.isPatientDeceased`) — deduplicated per patient
 * within a batch — so even a reminder whose `scheduledFor` falls inside the
 * few-second gap before `DeceasedEventPollerService`'s next tick still
 * cannot be sent. A live hit here also immediately invokes
 * `DeceasedSuppressionService.suppressAllForPatient` so the *rest* of that
 * patient's scheduled reminders (which this batch may not have reached
 * yet) are suppressed too, not just the one reminder in hand.
 */
@Injectable()
export class ReminderDispatchScheduler {
  private readonly logger = new Logger(ReminderDispatchScheduler.name);
  private readonly sender: ReminderChannelSender;

  constructor(
    private readonly prisma: PrismaService,
    private readonly consentSecurity: ConsentSecurityClient,
    private readonly suppression: DeceasedSuppressionService,
  ) {
    // MOCK — replace with real integration; see reminder-channel-sender.ts.
    this.sender = new MockReminderChannelSender();
  }

  @Interval(15000)
  async dispatchDue(): Promise<void> {
    try {
      const now = new Date();
      const prisma = this.prisma as unknown as {
        reminder: {
          findMany: (args: any) => Promise<DueReminderRow[]>;
          update: (args: any) => Promise<unknown>;
        };
      };

      const due = await prisma.reminder.findMany({
        where: {
          status: 'scheduled',
          scheduledFor: { lte: now },
          followUpPlan: { status: 'active' },
        },
        include: { followUpPlan: true },
        orderBy: { scheduledFor: 'asc' },
        take: BATCH_SIZE,
      });

      const deceasedCheckCache = new Map<string, boolean>();

      for (const row of due) {
        let isDeceased = deceasedCheckCache.get(row.patientId);
        if (isDeceased === undefined) {
          isDeceased = await this.consentSecurity.isPatientDeceased(row.patientId);
          deceasedCheckCache.set(row.patientId, isDeceased);
          if (isDeceased) {
            this.logger.warn(
              `Live check caught patient=${row.patientId} as deceased ahead of the poller — suppressing all their reminders now`,
            );
            await this.suppression.suppressAllForPatient(row.patientId, undefined, SYSTEM_ACTOR);
          }
        }
        if (isDeceased) {
          // suppressAllForPatient already flipped this row's status; nothing more to do for it.
          continue;
        }

        const result = await this.sender.send({
          reminderId: row.id,
          followUpPlanId: row.followUpPlanId,
          patientId: row.patientId,
          recipientType: row.recipientType as ReminderRecipientType,
          channel: row.channel as ReminderChannel,
          escalationLevel: row.escalationLevel,
          message: composeMessage(row),
        });

        await prisma.reminder.update({
          where: { id: row.id },
          data: result.delivered
            ? { status: 'sent', sentAt: new Date() }
            : { status: 'failed', failureReason: result.failureReason ?? 'unknown' },
        });
      }

      if (due.length > 0) {
        this.logger.log(`Dispatched ${due.length} due reminder(s)`);
      }
    } catch (err) {
      this.logger.error('Failed to dispatch due reminders', err instanceof Error ? err.stack : String(err));
    }
  }
}
