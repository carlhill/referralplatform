import { Injectable, Logger } from '@nestjs/common';
import type { ActorRef, AuditEventType } from '@referralplatform/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { writeOutbox, type OutboxTxClient } from '../audit-outbox/outbox-writer';

export interface SuppressionResult {
  plansSuppressed: number;
  remindersSuppressed: number;
}

interface FollowUpPlanRow {
  id: string;
  status: string;
}

interface TxClient extends OutboxTxClient {
  deceasedSuppression: {
    upsert: (args: any) => Promise<unknown>;
  };
  followUpPlan: {
    findMany: (args: any) => Promise<FollowUpPlanRow[]>;
    updateMany: (args: any) => Promise<{ count: number }>;
  };
  reminder: {
    updateMany: (args: any) => Promise<{ count: number }>;
  };
}

interface RootPrismaClient extends TxClient {
  $transaction: <T>(fn: (tx: TxClient) => Promise<T>) => Promise<T>;
}

export const SYSTEM_ACTOR: ActorRef = {
  principalType: 'system',
  id: 'followup-recall-deceased-suppression',
  displayName: 'Follow-up & Recall Service — deceased-patient suppression',
};

/**
 * The single implementation of "immediately suppress every pending
 * reminder for this patient, including already-scheduled-but-not-yet-sent
 * ones" — business-process-flow.md: "G6 GP flags patient deceased ...
 * suppresses F2 [reminder scheduling]" and modules-and-requirements.md's
 * Follow-up & Recall requirement that this must apply to already-scheduled
 * reminders, not just future scheduling decisions.
 *
 * Called from two places, deliberately sharing this one implementation
 * rather than duplicating the transaction:
 *   1. `DeceasedEventPollerService` — the primary path, on every new
 *      `patient.deceased.frozen` event polled from the Consent & Security
 *      Service (see its own doc comment for the polling cadence/rationale).
 *   2. `ReminderDispatchScheduler` — a defense-in-depth path: if its own
 *      last-mile live check (`ConsentSecurityClient.isPatientDeceased`)
 *      catches a deceased patient the poller hasn't processed yet (a race
 *      within one poll interval), it calls this too before returning to its
 *      normal dispatch loop, so the *next* tick has nothing left to
 *      accidentally send either.
 *
 * Idempotent: safe to call more than once for the same patient (a repeated
 * poll of an already-processed event, or the dispatch scheduler's
 * defense-in-depth path firing after the poller already caught it) — only
 * plans/reminders still in a non-terminal state are touched, so a second
 * call finds nothing left to do and returns zero counts.
 */
@Injectable()
export class DeceasedSuppressionService {
  private readonly logger = new Logger(DeceasedSuppressionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async suppressAllForPatient(
    patientId: string,
    sourceFlagId: string | undefined,
    actor: ActorRef = SYSTEM_ACTOR,
  ): Promise<SuppressionResult> {
    const prisma = this.prisma as unknown as RootPrismaClient;
    const now = new Date();

    return prisma.$transaction(async (tx: TxClient) => {
      await tx.deceasedSuppression.upsert({
        where: { patientId },
        create: { patientId, active: true, sourceFlagId, suppressedAt: now },
        update: { active: true, sourceFlagId, suppressedAt: now },
      });

      const activePlans = await tx.followUpPlan.findMany({
        where: { patientId, status: 'active' },
        select: { id: true, status: true },
      });

      if (activePlans.length > 0) {
        await tx.followUpPlan.updateMany({
          where: { patientId, status: 'active' },
          data: { status: 'suppressed_deceased' },
        });
      }

      let remindersSuppressedTotal = 0;

      for (const plan of activePlans) {
        const suppressedReminders = await tx.reminder.updateMany({
          where: { followUpPlanId: plan.id, status: 'scheduled' },
          data: { status: 'suppressed', suppressedAt: now, suppressedReason: 'patient_deceased' },
        });
        remindersSuppressedTotal += suppressedReminders.count;

        const type: AuditEventType = 'followup.reminder.suppressed';
        await writeOutbox(tx, {
          type,
          actor,
          subjectType: 'FollowUpPlan',
          subjectId: plan.id,
          payload: {
            patientId,
            sourceFlagId: sourceFlagId ?? null,
            remindersSuppressed: suppressedReminders.count,
            reason: 'patient_deceased',
          },
        });
      }

      // Also catch reminders belonging to a plan that is somehow already
      // completed/superseded but still has a stray "scheduled" row (should
      // not happen given FollowUpPlansService.recordTestCompletion always
      // cancels remaining reminders in the same transaction, but this is a
      // deliberately defensive extra sweep — see BUILD_LOG's judgment-call
      // notes on defense-in-depth).
      const strayReminders = await tx.reminder.updateMany({
        where: { patientId, status: 'scheduled' },
        data: { status: 'suppressed', suppressedAt: now, suppressedReason: 'patient_deceased' },
      });
      remindersSuppressedTotal += strayReminders.count;

      if (activePlans.length > 0 || strayReminders.count > 0) {
        this.logger.log(
          `Suppressed ${activePlans.length} active Follow-up Plan(s) and ${remindersSuppressedTotal} scheduled reminder(s) for deceased patient=${patientId}`,
        );
      }

      return { plansSuppressed: activePlans.length, remindersSuppressed: remindersSuppressedTotal };
    });
  }
}
