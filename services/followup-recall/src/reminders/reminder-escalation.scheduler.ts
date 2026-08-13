import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { computeEscalationReminders, escalationOffsetDays } from './reminder-scheduling';

interface OverdueActivePlanRow {
  id: string;
  patientId: string;
  nextReviewDueAt: Date;
}

interface ReminderLevelRow {
  escalationLevel: number;
}

const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly — escalation cadence is measured in days, not minutes

/**
 * business-process-flow.md module 6: "Not detected near due date ->
 * Escalating reminder to patient + GP" (the `F5 -> F3` loop back to the
 * "Test completed?" decision point). Runs hourly and, for every `active`
 * Follow-up Plan whose `nextReviewDueAt` has passed with no test
 * completion recorded, checks whether it's time to raise the escalation to
 * the next level (see reminder-scheduling.ts's `ESCALATION_OFFSETS_DAYS`
 * cadence) and, if so, schedules that level's patient+GP reminder pair
 * exactly once.
 *
 * Idempotent per level: looks at the highest `escalationLevel` already
 * present among the plan's reminders (any status — scheduled, sent,
 * suppressed, whatever) and only creates the *next* level's pair once that
 * level's own threshold date has arrived; never recreates a level that
 * already has reminders. A plan that's suppressed (deceased) or completed
 * is excluded by the `status: 'active'` filter, so escalation and deceased
 * suppression can never race to create a reminder after the fact — this
 * scheduler simply never looks at a non-active plan in the first place.
 */
@Injectable()
export class ReminderEscalationScheduler {
  private readonly logger = new Logger(ReminderEscalationScheduler.name);

  constructor(private readonly prisma: PrismaService) {}

  @Interval(SWEEP_INTERVAL_MS)
  async escalateOverdue(): Promise<void> {
    try {
      const now = new Date();
      const prisma = this.prisma as unknown as {
        followUpPlan: { findMany: (args: unknown) => Promise<OverdueActivePlanRow[]> };
        reminder: {
          findMany: (args: unknown) => Promise<ReminderLevelRow[]>;
          createMany: (args: unknown) => Promise<unknown>;
        };
      };

      const overduePlans = await prisma.followUpPlan.findMany({
        where: { status: 'active', nextReviewDueAt: { lte: now } },
        select: { id: true, patientId: true, nextReviewDueAt: true },
      });

      let escalatedCount = 0;

      for (const plan of overduePlans) {
        const existingLevels = await prisma.reminder.findMany({
          where: { followUpPlanId: plan.id, escalationLevel: { gt: 0 } },
          select: { escalationLevel: true },
        });
        const currentMaxLevel = existingLevels.reduce((max, r) => Math.max(max, r.escalationLevel), 0);
        const nextLevel = currentMaxLevel + 1;
        const nextLevelDueAt = new Date(
          plan.nextReviewDueAt.getTime() + escalationOffsetDays(nextLevel) * 24 * 60 * 60 * 1000,
        );

        if (nextLevelDueAt.getTime() > now.getTime()) {
          continue; // not time for the next escalation wave yet
        }

        const wave = computeEscalationReminders(plan.nextReviewDueAt, nextLevel, now);
        await prisma.reminder.createMany({
          data: wave.map((item) => ({
            followUpPlanId: plan.id,
            patientId: plan.patientId,
            recipientType: item.recipientType,
            channel: item.channel,
            scheduledFor: item.scheduledFor,
            escalationLevel: item.escalationLevel,
          })),
        });
        escalatedCount += 1;
      }

      if (escalatedCount > 0) {
        this.logger.log(`Raised escalation for ${escalatedCount} overdue Follow-up Plan(s)`);
      }
    } catch (err) {
      this.logger.error('Failed to sweep overdue Follow-up Plans for escalation', err instanceof Error ? err.stack : String(err));
    }
  }
}
